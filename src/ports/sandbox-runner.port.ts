// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@ports/sandbox-runner`
 * Purpose: Port interface for network-isolated sandbox command execution.
 * Scope: Defines contract for one-shot container execution. Does not implement execution logic.
 * Invariants:
 *   - Per SANDBOXED_AGENTS.md P0: One-shot containers, no long-lived sessions
 *   - Per NETWORK_DEFAULT_DENY: Container runs with network=none
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
 * Specification for a single sandbox command execution.
 */
export interface SandboxRunSpec {
  /** Unique run ID for correlation and logging */
  readonly runId: string;
  /** Host filesystem path to mount as /workspace in container */
  readonly workspacePath: string;
  /** Command to execute (passed to bash -c) */
  readonly command: string;
  /** Resource limits for the container */
  readonly limits: {
    /** Maximum runtime in seconds before timeout */
    readonly maxRuntimeSec: number;
    /** Maximum memory in megabytes */
    readonly maxMemoryMb: number;
  };
  /** Additional mounts (e.g., repo snapshot at /repo:ro) */
  readonly mounts?: readonly SandboxMount[];
}

/**
 * Error codes for sandbox execution failures.
 */
export type SandboxErrorCode =
  | "timeout"
  | "oom_killed"
  | "internal"
  | "container_failed";

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
}

/**
 * Port interface for sandbox command execution.
 *
 * Per SANDBOXED_AGENTS.md P0: Containers are ephemeral and one-shot.
 * Each `runOnce` call creates a new container, runs the command, and removes it.
 *
 * The container runs with network=none for isolation.
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
