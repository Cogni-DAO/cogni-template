// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/sandbox/sandbox-runner`
 * Purpose: Docker-based sandbox runner for network-isolated command execution.
 * Scope: Implements SandboxRunnerPort using dockerode for container lifecycle management. Does not handle persistent containers or LLM loop integration.
 * Invariants:
 *   - Per SANDBOXED_AGENTS.md P0: One-shot containers, ephemeral per command
 *   - Per NETWORK_DEFAULT_DENY: Containers run with NetworkMode: 'none' by default
 *   - Per SECRETS_HOST_ONLY: No credentials passed to container
 * Side-effects: IO (creates/removes Docker containers)
 * Links: docs/SANDBOXED_AGENTS.md, src/ports/sandbox-runner.port.ts
 * @internal
 */

import { PassThrough } from "node:stream";

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

/** Default max output size: 2MB */
const DEFAULT_MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

/** Default process limit per container */
const DEFAULT_PIDS_LIMIT = 256;

/**
 * Docker-based sandbox runner adapter.
 *
 * Per SANDBOXED_AGENTS.md P0: Containers are one-shot and ephemeral.
 * Each runOnce call:
 * 1. Creates a new container with network=none (or internal network)
 * 2. Mounts the workspace directory
 * 3. Runs the command
 * 4. Collects stdout/stderr (with truncation)
 * 5. Removes the container
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
    const {
      runId,
      workspacePath,
      argv,
      limits,
      mounts = [],
      networkMode,
    } = spec;
    const containerName = `sandbox-${runId}-${Date.now()}`;

    // Resolve network mode (default: none for complete isolation)
    const networkConfig = networkMode ?? { mode: "none" as const };

    // Validate internal network mode requires a network name
    if (networkConfig.mode === "internal" && !networkConfig.networkName) {
      throw new Error("networkMode.networkName required when mode is internal");
    }

    // Determine Docker network mode string
    const dockerNetworkMode =
      networkConfig.mode === "internal" && networkConfig.networkName
        ? networkConfig.networkName
        : "none";

    const maxOutputBytes = limits.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;

    this.log.debug(
      {
        runId,
        containerName,
        argv,
        workspacePath,
        mountCount: mounts.length,
        networkMode: dockerNetworkMode,
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
      // Create container with strict isolation and security hardening
      container = await this.docker.createContainer({
        Image: this.imageName,
        name: containerName,
        // Override entrypoint to allow full argv control
        // The image has ENTRYPOINT ["/bin/bash", "-lc"] for single-command usage,
        // but argv[] requires direct control over the command execution
        Entrypoint: argv as string[],
        Cmd: [],
        HostConfig: {
          // Network mode: 'none' for isolation, or internal network name
          NetworkMode: dockerNetworkMode,
          // Memory limit
          Memory: limits.maxMemoryMb * 1024 * 1024,
          MemorySwap: limits.maxMemoryMb * 1024 * 1024, // No swap
          // Mount workspace + additional mounts
          Binds: binds,
          // Manual removal - AutoRemove races with log collection
          AutoRemove: false,
          // Security: read-only root filesystem with tmpfs for writable areas
          ReadonlyRootfs: true,
          Tmpfs: {
            "/tmp": "rw,noexec,nosuid,size=64m",
            "/run": "rw,noexec,nosuid,size=8m",
          },
          // Drop all capabilities
          CapDrop: ["ALL"],
          // No privileged mode
          Privileged: false,
          // Prevent privilege escalation
          SecurityOpt: ["no-new-privileges:true"],
          // Limit number of processes to prevent fork bombs
          PidsLimit: DEFAULT_PIDS_LIMIT,
        },
        // Working directory
        WorkingDir: "/workspace",
        // Run as non-root user (matches Dockerfile)
        User: "sandboxer",
      });

      // Start container
      await container.start();

      // Wait for completion with timeout (properly cleaned up)
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
        const logs = await this.collectLogs(container, maxOutputBytes);
        return {
          ok: false,
          stdout: logs.stdout,
          stderr: logs.stderr || "Command timed out",
          exitCode: -1,
          errorCode: "timeout",
          outputTruncated: logs.truncated,
        };
      }

      // Collect logs after container exits
      const logs = await this.collectLogs(container, maxOutputBytes);

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
          outputTruncated: logs.truncated,
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
        outputTruncated: logs.truncated,
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
   * Properly cleans up timeout to prevent timer leaks.
   */
  private async waitWithTimeout(
    container: Docker.Container,
    timeoutMs: number
  ): Promise<{ statusCode: number; timedOut: boolean }> {
    let timeoutId: NodeJS.Timeout | undefined;

    const timeoutPromise = new Promise<{ statusCode: number; timedOut: true }>(
      (resolve) => {
        timeoutId = setTimeout(
          () => resolve({ statusCode: -1, timedOut: true }),
          timeoutMs
        );
      }
    );

    const waitPromise = container.wait().then((result) => ({
      statusCode: result.StatusCode,
      timedOut: false as const,
    }));

    try {
      return await Promise.race([waitPromise, timeoutPromise]);
    } finally {
      // Always clear the timeout to prevent leaks
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Collect stdout and stderr from container logs.
   * Uses dockerode's demuxStream for proper stream handling.
   * Enforces output size limits to prevent memory exhaustion.
   */
  private async collectLogs(
    container: Docker.Container,
    maxBytes: number
  ): Promise<{ stdout: string; stderr: string; truncated: boolean }> {
    try {
      const logStream = await container.logs({
        stdout: true,
        stderr: true,
        follow: false,
      });

      // If logStream is a Buffer (non-TTY container), parse it directly
      if (Buffer.isBuffer(logStream)) {
        return this.parseDemuxedBuffer(logStream, maxBytes);
      }

      // If it's a stream, collect with demux
      return await this.collectFromStream(logStream, maxBytes);
    } catch {
      return { stdout: "", stderr: "", truncated: false };
    }
  }

  /**
   * Parse a demuxed buffer from Docker logs.
   * Docker logs are multiplexed: each frame has 8-byte header.
   * Byte 0: stream type (1=stdout, 2=stderr)
   * Bytes 4-7: frame size (big-endian)
   */
  private parseDemuxedBuffer(
    buffer: Buffer,
    maxBytes: number
  ): { stdout: string; stderr: string; truncated: boolean } {
    const stdout: string[] = [];
    const stderr: string[] = [];
    let totalBytes = 0;
    let truncated = false;

    let offset = 0;
    while (offset < buffer.length) {
      if (offset + 8 > buffer.length) break;

      const streamType = buffer.readUInt8(offset);
      const frameSize = buffer.readUInt32BE(offset + 4);

      if (offset + 8 + frameSize > buffer.length) break;

      // Check if we'd exceed max bytes
      if (totalBytes + frameSize > maxBytes) {
        truncated = true;
        break;
      }

      const content = buffer
        .subarray(offset + 8, offset + 8 + frameSize)
        .toString("utf8");

      if (streamType === 1) {
        stdout.push(content);
      } else if (streamType === 2) {
        stderr.push(content);
      }

      totalBytes += frameSize;
      offset += 8 + frameSize;
    }

    const result = {
      stdout: stdout.join(""),
      stderr: stderr.join(""),
      truncated,
    };

    // Add truncation marker if needed
    if (truncated) {
      result.stderr += "\n[OUTPUT TRUNCATED - exceeded max bytes]";
    }

    return result;
  }

  /**
   * Collect logs from a stream using dockerode's demux.
   */
  private async collectFromStream(
    logStream: NodeJS.ReadableStream,
    maxBytes: number
  ): Promise<{ stdout: string; stderr: string; truncated: boolean }> {
    return new Promise((resolve) => {
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let totalBytes = 0;
      let truncated = false;

      const stdout = new PassThrough();
      const stderr = new PassThrough();

      stdout.on("data", (chunk: Buffer) => {
        if (totalBytes + chunk.length <= maxBytes) {
          stdoutChunks.push(chunk);
          totalBytes += chunk.length;
        } else {
          truncated = true;
        }
      });

      stderr.on("data", (chunk: Buffer) => {
        if (totalBytes + chunk.length <= maxBytes) {
          stderrChunks.push(chunk);
          totalBytes += chunk.length;
        } else {
          truncated = true;
        }
      });

      // Use dockerode's modem to demux the stream
      this.docker.modem.demuxStream(logStream, stdout, stderr);

      logStream.on("end", () => {
        const result = {
          stdout: Buffer.concat(stdoutChunks).toString("utf8"),
          stderr: Buffer.concat(stderrChunks).toString("utf8"),
          truncated,
        };

        if (truncated) {
          result.stderr += "\n[OUTPUT TRUNCATED - exceeded max bytes]";
        }

        resolve(result);
      });

      logStream.on("error", () => {
        resolve({ stdout: "", stderr: "", truncated: false });
      });

      // Safety timeout for stream collection
      setTimeout(() => {
        resolve({
          stdout: Buffer.concat(stdoutChunks).toString("utf8"),
          stderr: Buffer.concat(stderrChunks).toString("utf8"),
          truncated,
        });
      }, 5000);
    });
  }
}
