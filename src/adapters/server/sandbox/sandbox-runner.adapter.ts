// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/sandbox/sandbox-runner`
 * Purpose: Docker-based sandbox runner for network-isolated command execution.
 * Scope: Implements SandboxRunnerPort using dockerode for container lifecycle management. Does not handle persistent containers or LLM loop integration.
 * Invariants:
 *   - Per SANDBOXED_AGENTS.md P0: One-shot containers, ephemeral per command
 *   - Per NETWORK_DEFAULT_DENY: Containers run with NetworkMode: 'none'
 *   - Per SECRETS_HOST_ONLY: No credentials passed to container
 * Side-effects: IO (creates/removes Docker containers)
 * Links: docs/SANDBOXED_AGENTS.md, src/ports/sandbox-runner.port.ts
 * @internal
 */

import Docker from "dockerode";
import type { Logger } from "pino";

import type {
  SandboxRunnerPort,
  SandboxRunResult,
  SandboxRunSpec,
} from "@/ports";
import { makeLogger } from "@/shared/observability";

/**
 * Default Docker image for sandbox containers.
 * Built from services/sandbox-runtime/Dockerfile
 */
const DEFAULT_SANDBOX_IMAGE = "cogni-sandbox-runtime:latest";

/**
 * Docker-based sandbox runner adapter.
 *
 * Per SANDBOXED_AGENTS.md P0: Containers are one-shot and ephemeral.
 * Each runOnce call:
 * 1. Creates a new container with network=none
 * 2. Mounts the workspace directory
 * 3. Runs the command
 * 4. Collects stdout/stderr
 * 5. Removes the container (AutoRemove)
 */
export class SandboxRunnerAdapter implements SandboxRunnerPort {
  private readonly docker: Docker;
  private readonly log: Logger;
  private readonly imageName: string;

  constructor(options?: { imageName?: string }) {
    this.docker = new Docker();
    this.log = makeLogger({ component: "SandboxRunnerAdapter" });
    this.imageName = options?.imageName ?? DEFAULT_SANDBOX_IMAGE;
  }

  async runOnce(spec: SandboxRunSpec): Promise<SandboxRunResult> {
    const { runId, workspacePath, command, limits, mounts = [] } = spec;
    const containerName = `sandbox-${runId}-${Date.now()}`;

    this.log.debug(
      {
        runId,
        containerName,
        command,
        workspacePath,
        mountCount: mounts.length,
      },
      "Starting sandbox container"
    );

    // Build bind mounts: workspace (always rw) + additional mounts
    const binds = [
      `${workspacePath}:/workspace:rw`,
      ...mounts.map((m) => `${m.hostPath}:${m.containerPath}:${m.mode}`),
    ];

    let container: Docker.Container | undefined;

    try {
      // Create container with strict isolation
      container = await this.docker.createContainer({
        Image: this.imageName,
        name: containerName,
        Cmd: [command],
        NetworkDisabled: true,
        HostConfig: {
          // Network isolation - no external connectivity
          NetworkMode: "none",
          // Memory limit
          Memory: limits.maxMemoryMb * 1024 * 1024,
          MemorySwap: limits.maxMemoryMb * 1024 * 1024, // No swap
          // Mount workspace + additional mounts
          Binds: binds,
          // Manual removal - AutoRemove races with log collection
          AutoRemove: false,
          // Security: read-only root filesystem except /workspace and /tmp
          ReadonlyRootfs: false, // Need write for /tmp
          // Drop all capabilities
          CapDrop: ["ALL"],
          // No privileged mode
          Privileged: false,
        },
        // Working directory
        WorkingDir: "/workspace",
        // Run as non-root user (matches Dockerfile)
        User: "sandboxer",
      });

      // Start container
      await container.start();

      // Wait for completion with timeout
      const waitResult = await this.waitWithTimeout(
        container,
        limits.maxRuntimeSec * 1000
      );

      // Handle timeout - kill container first
      if (waitResult.timedOut) {
        this.log.warn({ runId, containerName }, "Sandbox container timed out");
        try {
          await container.kill();
        } catch {
          // Container may already be stopped
        }
        // Collect any partial logs
        const logs = await this.collectLogs(container);
        return {
          ok: false,
          stdout: logs.stdout,
          stderr: logs.stderr || "Command timed out",
          exitCode: -1,
          errorCode: "timeout",
        };
      }

      // Collect logs after container exits
      const logs = await this.collectLogs(container);

      // Check if OOM killed
      const inspection = await container.inspect().catch(() => null);
      const oomKilled = inspection?.State?.OOMKilled ?? false;

      if (oomKilled) {
        this.log.warn({ runId, containerName }, "Sandbox container OOM killed");
        return {
          ok: false,
          stdout: logs.stdout,
          stderr: logs.stderr,
          exitCode: waitResult.statusCode,
          errorCode: "oom_killed",
        };
      }

      this.log.debug(
        { runId, containerName, exitCode: waitResult.statusCode },
        "Sandbox container completed"
      );

      return {
        ok: waitResult.statusCode === 0,
        stdout: logs.stdout,
        stderr: logs.stderr,
        exitCode: waitResult.statusCode,
      };
    } catch (error) {
      this.log.error(
        { runId, containerName, error },
        "Sandbox container execution failed"
      );

      return {
        ok: false,
        stdout: "",
        stderr: error instanceof Error ? error.message : "Unknown error",
        exitCode: -1,
        errorCode: "internal",
      };
    } finally {
      // Always cleanup container
      if (container) {
        try {
          await container.remove({ force: true });
        } catch {
          // Container may already be removed or never started
        }
      }
    }
  }

  /**
   * Wait for container with timeout.
   */
  private async waitWithTimeout(
    container: Docker.Container,
    timeoutMs: number
  ): Promise<{ statusCode: number; timedOut: boolean }> {
    const timeoutPromise = new Promise<{ statusCode: number; timedOut: true }>(
      (resolve) => {
        setTimeout(
          () => resolve({ statusCode: -1, timedOut: true }),
          timeoutMs
        );
      }
    );

    const waitPromise = container.wait().then((result) => ({
      statusCode: result.StatusCode,
      timedOut: false as const,
    }));

    return Promise.race([waitPromise, timeoutPromise]);
  }

  /**
   * Collect stdout and stderr from container logs.
   * Docker multiplexes stdout/stderr in the log stream with header bytes.
   */
  private async collectLogs(
    container: Docker.Container
  ): Promise<{ stdout: string; stderr: string }> {
    try {
      const logStream = await container.logs({
        stdout: true,
        stderr: true,
        follow: false,
      });

      // Docker logs are multiplexed: each frame has 8-byte header
      // Byte 0: stream type (1=stdout, 2=stderr)
      // Bytes 4-7: frame size (big-endian)
      const buffer = Buffer.isBuffer(logStream)
        ? logStream
        : Buffer.from(logStream as string, "utf8");

      const stdout: string[] = [];
      const stderr: string[] = [];

      let offset = 0;
      while (offset < buffer.length) {
        if (offset + 8 > buffer.length) break;

        const streamType = buffer.readUInt8(offset);
        const frameSize = buffer.readUInt32BE(offset + 4);

        if (offset + 8 + frameSize > buffer.length) break;

        const content = buffer
          .subarray(offset + 8, offset + 8 + frameSize)
          .toString("utf8");

        if (streamType === 1) {
          stdout.push(content);
        } else if (streamType === 2) {
          stderr.push(content);
        }

        offset += 8 + frameSize;
      }

      return {
        stdout: stdout.join(""),
        stderr: stderr.join(""),
      };
    } catch {
      return { stdout: "", stderr: "" };
    }
  }
}
