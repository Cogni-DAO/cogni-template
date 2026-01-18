// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@types/scheduling`
 * Purpose: Shared scheduling type definitions and constants (logic-free).
 * Scope: Defines ExecutionGrant, ScheduleSpec, ScheduleRun types and status enums. Does not contain logic.
 * Invariants:
 * - ONLY exports: enums (as const arrays), literal union types, and interfaces
 * - FORBIDDEN: functions, computations, validation logic, or business rules
 * - Grant scopes constrain which graphIds can be executed (GRANT_SCOPES_CONSTRAIN_GRAPHS)
 * Side-effects: none (constants and types only)
 * Links: docs/SCHEDULER_SPEC.md, schema.scheduling.ts, ports/schedule-manager.port.ts
 * @public
 */

/**
 * Schedule run status values.
 * - pending: Job enqueued, not yet started
 * - running: Execution in progress
 * - success: Completed successfully
 * - error: Failed with error
 * - skipped: Skipped (disabled schedule or revoked grant)
 */
export const SCHEDULE_RUN_STATUSES = [
  "pending",
  "running",
  "success",
  "error",
  "skipped",
] as const;

export type ScheduleRunStatus = (typeof SCHEDULE_RUN_STATUSES)[number];

/**
 * Grant scope action types.
 * P0: Only graph:execute is supported.
 */
export const GRANT_SCOPE_ACTIONS = ["graph:execute"] as const;

export type GrantScopeAction = (typeof GRANT_SCOPE_ACTIONS)[number];

/**
 * Execution grant - durable authorization for scheduled graph execution.
 * Per GRANT_NOT_SESSION: Scheduled runs authenticate via grants, not user sessions.
 * Note: virtualKeyId is resolved at runtime via AccountService (not stored in grant).
 */
export interface ExecutionGrant {
  readonly id: string;
  readonly userId: string;
  readonly billingAccountId: string;
  /** Scopes in format "graph:execute:{graphId}" or "graph:execute:*" for wildcard */
  readonly scopes: readonly string[];
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
  readonly createdAt: Date;
}

/**
 * Schedule specification - defines a recurring graph execution.
 */
export interface ScheduleSpec {
  readonly id: string;
  readonly ownerUserId: string;
  readonly executionGrantId: string;
  readonly graphId: string;
  readonly input: unknown;
  readonly cron: string;
  readonly timezone: string;
  readonly enabled: boolean;
  readonly nextRunAt: Date | null;
  readonly lastRunAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Schedule run record - execution ledger entry for auditability.
 * Per P0 feedback: Minimal execution persistence for governance and debugging.
 */
export interface ScheduleRun {
  readonly id: string;
  readonly scheduleId: string;
  readonly runId: string;
  readonly scheduledFor: Date;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
  readonly status: ScheduleRunStatus;
  readonly attemptCount: number;
  readonly langfuseTraceId: string | null;
  readonly errorMessage: string | null;
}
