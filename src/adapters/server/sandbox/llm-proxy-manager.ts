// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/sandbox/llm-proxy-manager`
 * Purpose: Manages containerized Nginx proxy for sandbox LLM access.
 * Scope: Spawns/stops nginx:alpine containers via dockerode. Does not handle sandbox container lifecycle.
 * Invariants:
 *   - Per SECRETS_HOST_ONLY: LITELLM_MASTER_KEY stays in proxy container, never in sandbox
 *   - Per HOST_INJECTS_BILLING_HEADER: Proxy sets x-litellm-end-user-id
 *   - Per APPEND_ONLY_AUDIT: Access logs written by proxy container, collected on stop
 *   - No host-installed nginx required (hermetic)
 * Side-effects: IO (Docker containers, writes config files to tmpdir)
 * Links: docs/SANDBOXED_AGENTS.md, platform/infra/services/sandbox-proxy/nginx.conf.template
 * @internal
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Docker from "dockerode";
import type { Logger } from "pino";

import { makeLogger } from "@/shared/observability";

/** Nginx image for proxy container */
const NGINX_IMAGE = "nginx:alpine";

/** Docker network where LiteLLM is reachable (internal: true — no internet egress) */
const PROXY_NETWORK = "sandbox-internal";

/** Configuration for starting an LLM proxy instance */
export interface LlmProxyConfig {
  /** Unique run ID for this sandbox execution */
  runId: string;
  /** Attempt number (for retry tracking) */
  attempt: number;
  /** LiteLLM master key for authentication */
  litellmMasterKey: string;
  /** LiteLLM host:port as seen from proxy container (default: litellm:4000) */
  litellmHost?: string;
  /** Base directory for socket dirs and logs (default: os.tmpdir()/cogni-llm-proxy) */
  baseDir?: string;
}

/** Result of starting an LLM proxy */
export interface LlmProxyHandle {
  /** Path to the socket DIRECTORY on host (mount this into sandbox) */
  socketDir: string;
  /** Socket filename within the directory */
  socketName: string;
  /** Full socket path for reference */
  socketPath: string;
  /** Path to the access log file (after stop) */
  logPath: string;
  /** Path to the generated config file */
  configPath: string;
  /** Proxy container ID */
  containerId: string;
}

/** Path to the nginx config template */
const TEMPLATE_PATH = join(
  process.cwd(),
  "platform/infra/services/sandbox-proxy/nginx.conf.template"
);

/**
 * Manages containerized Nginx proxy instances for sandbox LLM access.
 *
 * Per SANDBOXED_AGENTS.md P0.5: Each sandbox run gets its own proxy container
 * with isolated socket directory, config, and log files.
 *
 * Architecture:
 * - Proxy container runs nginx:alpine on sandbox-internal network
 * - Listens on unix socket in shared directory
 * - Sandbox container (network=none) mounts same directory
 * - socat in sandbox bridges localhost:8080 to socket
 */
export class LlmProxyManager {
  private readonly docker: Docker;
  private readonly log: Logger;
  private readonly containers: Map<string, Docker.Container> = new Map();
  private readonly handles: Map<string, LlmProxyHandle> = new Map();

  constructor() {
    this.docker = new Docker();
    this.log = makeLogger({ component: "LlmProxyManager" });
  }

  /**
   * Start an Nginx proxy container for a sandbox run.
   *
   * @param config - Proxy configuration
   * @returns Handle with socket directory path for mounting
   * @throws If proxy container fails to start
   */
  async start(config: LlmProxyConfig): Promise<LlmProxyHandle> {
    const { runId, attempt, litellmMasterKey, litellmHost, baseDir } = config;

    // Check if already running
    if (this.containers.has(runId)) {
      throw new Error(`Proxy already running for runId: ${runId}`);
    }

    // Create isolated directory for this run's socket
    const base = baseDir ?? join(tmpdir(), "cogni-llm-proxy");
    const socketDir = join(base, runId);
    const socketName = "llm.sock";
    const socketPath = join(socketDir, socketName);
    const configPath = join(socketDir, "nginx.conf");
    const logPath = join(socketDir, "access.log");

    this.log.debug({ runId, socketDir }, "Starting LLM proxy container");

    // Create socket directory
    mkdirSync(socketDir, { recursive: true, mode: 0o755 });

    // Generate config from template
    const configContent = this.generateConfig({
      socketPath: `/run/llm/${socketName}`, // Path inside container
      logPath: "/var/log/nginx/access.log", // Path inside container
      runId,
      attempt,
      litellmMasterKey,
      litellmHost: litellmHost ?? "litellm:4000", // Docker DNS
    });

    // Write config file
    writeFileSync(configPath, configContent, { mode: 0o600 });

    // Ensure nginx image is available
    await this.ensureImage(NGINX_IMAGE);

    // Create and start proxy container
    const containerName = `llm-proxy-${runId}`;
    const container = await this.docker.createContainer({
      Image: NGINX_IMAGE,
      name: containerName,
      HostConfig: {
        // Connect to same network as LiteLLM
        NetworkMode: PROXY_NETWORK,
        // Mount socket directory (rw so nginx can create socket)
        // Mount config file (ro)
        Binds: [
          `${socketDir}:/run/llm:rw`,
          `${configPath}:/etc/nginx/nginx.conf:ro`,
        ],
        // Auto-remove disabled - we need to collect logs first
        AutoRemove: false,
      },
    });

    await container.start();

    // Wait for socket to appear
    await this.waitForSocket(socketPath, 10000);

    this.containers.set(runId, container);
    const handle: LlmProxyHandle = {
      socketDir,
      socketName,
      socketPath,
      logPath,
      configPath,
      containerId: container.id,
    };
    this.handles.set(runId, handle);

    this.log.info(
      { runId, socketPath, containerId: container.id },
      "LLM proxy container started"
    );
    return handle;
  }

  /**
   * Stop the proxy container for a sandbox run.
   *
   * @param runId - The run ID to stop
   * @returns Path to the access log, or null if not found
   */
  async stop(runId: string): Promise<string | null> {
    const container = this.containers.get(runId);
    const handle = this.handles.get(runId);

    if (!container) {
      this.log.warn({ runId }, "No proxy container found to stop");
      return handle?.logPath ?? null;
    }

    this.log.debug({ runId }, "Stopping LLM proxy container");

    try {
      // Copy access log from container before stopping
      if (handle) {
        await this.copyLogFromContainer(container, handle.logPath);
      }

      // Stop container
      await container.stop({ t: 5 }).catch(() => {
        // Container may already be stopped
      });

      // Remove container
      await container.remove({ force: true }).catch(() => {
        // Container may already be removed
      });
    } catch (err) {
      this.log.warn({ runId, error: err }, "Error stopping proxy container");
    }

    this.containers.delete(runId);

    this.log.info(
      { runId, logPath: handle?.logPath },
      "LLM proxy container stopped"
    );
    return handle?.logPath ?? null;
  }

  /**
   * Clean up socket directory for a run.
   * Call this after stop() when you're done with the logs.
   */
  cleanup(runId: string): void {
    const handle = this.handles.get(runId);
    if (handle?.socketDir && existsSync(handle.socketDir)) {
      try {
        rmSync(handle.socketDir, { recursive: true, force: true });
        this.log.debug(
          { runId, socketDir: handle.socketDir },
          "Cleaned up socket directory"
        );
      } catch (err) {
        this.log.warn(
          { runId, error: err },
          "Failed to cleanup socket directory"
        );
      }
    }
    this.handles.delete(runId);
  }

  /**
   * Check if a proxy is running for a given runId.
   */
  isRunning(runId: string): boolean {
    return this.containers.has(runId);
  }

  /**
   * Stop all running proxy containers (for cleanup).
   */
  async stopAll(): Promise<void> {
    const runIds = Array.from(this.containers.keys());
    await Promise.all(runIds.map((runId) => this.stop(runId)));
  }

  /**
   * Ensure Docker image is available, pull if needed.
   */
  private async ensureImage(imageName: string): Promise<void> {
    try {
      await this.docker.getImage(imageName).inspect();
    } catch {
      this.log.info({ imageName }, "Pulling Docker image");
      await new Promise<void>((resolve, reject) => {
        this.docker.pull(
          imageName,
          (err: Error | null, stream: NodeJS.ReadableStream) => {
            if (err) {
              reject(err);
              return;
            }
            // Follow the pull progress
            this.docker.modem.followProgress(
              stream,
              (pullErr: Error | null) => {
                if (pullErr) {
                  reject(pullErr);
                } else {
                  resolve();
                }
              }
            );
          }
        );
      });
    }
  }

  /**
   * Copy access log from container to host.
   */
  private async copyLogFromContainer(
    container: Docker.Container,
    hostLogPath: string
  ): Promise<void> {
    try {
      // Exec cat to get access log content (container.logs() gives stdout, not file contents)
      const exec = await container.exec({
        Cmd: ["cat", "/var/log/nginx/access.log"],
        AttachStdout: true,
        AttachStderr: true,
      });

      const stream = await exec.start({ hijack: true, stdin: false });
      const chunks: Buffer[] = [];

      await new Promise<void>((resolve) => {
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("end", resolve);
        stream.on("error", resolve); // Don't fail if log collection fails
      });

      if (chunks.length > 0) {
        const logContent = Buffer.concat(chunks).toString("utf8");
        writeFileSync(hostLogPath, logContent);
      }
    } catch {
      // Log collection is best-effort
      this.log.debug("Could not collect proxy access log");
    }
  }

  /**
   * Generate nginx config from template with variable substitution.
   */
  private generateConfig(vars: {
    socketPath: string;
    logPath: string;
    runId: string;
    attempt: number;
    litellmMasterKey: string;
    litellmHost: string;
  }): string {
    // Read template
    if (!existsSync(TEMPLATE_PATH)) {
      throw new Error(`Nginx template not found: ${TEMPLATE_PATH}`);
    }
    let template = readFileSync(TEMPLATE_PATH, "utf-8");

    // Substitute variables (mimics envsubst)
    const substitutions: Record<string, string> = {
      SOCKET_PATH: vars.socketPath,
      ACCESS_LOG_PATH: vars.logPath,
      RUN_ID: vars.runId,
      ATTEMPT: String(vars.attempt),
      LITELLM_MASTER_KEY: vars.litellmMasterKey,
      LITELLM_HOST: vars.litellmHost,
    };

    for (const [key, value] of Object.entries(substitutions)) {
      // Replace both ${VAR} and $VAR patterns
      template = template.replace(new RegExp(`\\$\\{${key}\\}`, "g"), value);
      template = template.replace(
        new RegExp(`\\$${key}(?![A-Z_])`, "g"),
        value
      );
    }

    return template;
  }

  /**
   * Wait for a unix socket to appear (nginx startup).
   */
  private async waitForSocket(
    socketPath: string,
    timeoutMs: number
  ): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (existsSync(socketPath)) {
        return;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`Timeout waiting for proxy socket: ${socketPath}`);
  }
}
