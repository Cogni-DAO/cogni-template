// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@ports/sandbox-runner`
 * Purpose: Port interface for network-isolated sandbox command execution.
 * Scope: Defines contract for one-shot container execution. Does not implement execution logic.
 * Invariants:
 *   - Per SANDBOXED_AGENTS.md P0: One-shot containers, no long-lived sessions
 *   - Per NETWORK_DEFAULT_DENY: Container runs with network=none by default
 *   - Per SECRETS_HOST_ONLY: No tokens/credentials passed to sandbox
 * Side-effects: none (interface definition only)
 * Links: docs/SANDBOXED_AGENTS.md
 * @public
 */

/**
 * Mount specification for binding host paths into the container.
 */
export interface SandboxMount {
  /** Host filesystem path to mount */
  readonly hostPath: string;
  /** Path inside container where mount appears */
  readonly containerPath: string;
  /** Mount mode: 'ro' for read-only, 'rw' for read-write */
  readonly mode: "ro" | "rw";
}

/**
 * Network mode configuration for sandbox containers.
 */
export interface SandboxNetworkMode {
  /**
   * Network mode for container execution.
   * - 'none' (default): Complete network isolation (P0 baseline)
   * - 'internal': Attach to named internal network (P0.5+)
   */
  readonly mode: "none" | "internal";
  /** Required when mode='internal'. Must be a Docker network with internal:true */
  readonly networkName?: string;
}

/**
 * Specification for a single sandbox command execution.
 */
export interface SandboxRunSpec {
  /** Unique run ID for correlation and logging */
  readonly runId: string;
  /** Host filesystem path to mount as /workspace in container */
  readonly workspacePath: string;
  /**
   * Command arguments to execute.
   * For shell commands, use: ['bash', '-lc', 'your command here']
   * For direct binaries, use: ['/usr/bin/node', 'script.js']
   */
  readonly argv: readonly string[];
  /** Resource limits for the container */
  readonly limits: {
    /** Maximum runtime in seconds before timeout */
    readonly maxRuntimeSec: number;
    /** Maximum memory in megabytes */
    readonly maxMemoryMb: number;
    /** Maximum combined stdout+stderr bytes (default: 2MB) */
    readonly maxOutputBytes?: number;
  };
  /** Additional mounts (e.g., repo snapshot at /repo:ro) */
  readonly mounts?: readonly SandboxMount[];
  /**
   * Network mode for container. Defaults to { mode: 'none' } for complete isolation.
   * Use { mode: 'internal', networkName: 'sandbox-internal' } for LiteLLM access.
   */
  readonly networkMode?: SandboxNetworkMode;
}

/**
 * Error codes for sandbox execution failures.
 */
export type SandboxErrorCode =
  | "timeout"
  | "oom_killed"
  | "internal"
  | "container_failed"
  | "output_truncated";

/**
 * Result of a sandbox command execution.
 */
export interface SandboxRunResult {
  /** True if command exited with code 0 */
  readonly ok: boolean;
  /** Standard output from the command */
  readonly stdout: string;
  /** Standard error from the command */
  readonly stderr: string;
  /** Exit code from the command */
  readonly exitCode: number;
  /** Error code if execution failed (timeout, OOM, etc.) */
  readonly errorCode?: SandboxErrorCode;
  /** True if output was truncated due to size limits */
  readonly outputTruncated?: boolean;
}

/**
 * Port interface for sandbox command execution.
 *
 * Per SANDBOXED_AGENTS.md P0: Containers are ephemeral and one-shot.
 * Each `runOnce` call creates a new container, runs the command, and removes it.
 *
 * The container runs with network=none for isolation by default.
 * Host mounts workspace directory for file I/O.
 */
export interface SandboxRunnerPort {
  /**
   * Execute a single command in an isolated container.
   *
   * Flow: create container → start → run command → collect output → remove
   *
   * @param spec - Command specification with workspace path and limits
   * @returns Promise resolving to execution result with stdout/stderr
   */
  runOnce(spec: SandboxRunSpec): Promise<SandboxRunResult>;
}
