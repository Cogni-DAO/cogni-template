// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/scheduler-core`
 * Purpose: Scheduler core types and port interfaces.
 * Scope: Pure types and interfaces for scheduling domain. Does not contain implementations or I/O.
 * Invariants:
 * - FORBIDDEN: `@/`, `src/`, drizzle-orm, any I/O
 * - ALLOWED: Pure TypeScript types/interfaces only
 * Side-effects: none
 * Links: docs/SCHEDULER_SPEC.md
 * @public
 */

// Job payloads (Zod schemas for producer/consumer validation)
export {
  type ExecuteScheduledRunPayload,
  ExecuteScheduledRunPayloadSchema,
  type ReconcileSchedulesPayload,
  ReconcileSchedulesPayloadSchema,
  SCHEDULER_TASK_IDS,
  type SchedulerTaskId,
} from "./payloads";
// Ports
export {
  // ScheduleManagerPort
  type CreateScheduleInput,
  // ScheduleControlPort
  type CreateScheduleParams,
  // ExecutionGrantPort
  type ExecutionGrantPort,
  // ExecutionRequestPort
  type ExecutionOutcome,
  type ExecutionRequest,
  type ExecutionRequestPort,
  GrantExpiredError,
  GrantNotFoundError,
  GrantRevokedError,
  GrantScopeMismatchError,
  type IdempotencyCheckResult,
  InvalidCronExpressionError,
  InvalidTimezoneError,
  isGrantExpiredError,
  isGrantNotFoundError,
  isGrantRevokedError,
  isGrantScopeMismatchError,
  isInvalidCronExpressionError,
  isInvalidTimezoneError,
  isScheduleAccessDeniedError,
  isScheduleControlConflictError,
  isScheduleControlNotFoundError,
  isScheduleControlUnavailableError,
  isScheduleNotFoundError,
  ScheduleAccessDeniedError,
  ScheduleControlConflictError,
  ScheduleControlNotFoundError,
  type ScheduleControlPort,
  ScheduleControlUnavailableError,
  type ScheduleDescription,
  type ScheduleManagerPort,
  ScheduleNotFoundError,
  // ScheduleRunRepository
  type ScheduleRunRepository,
  type UpdateScheduleInput,
} from "./ports";
// Types
export {
  type ExecutionGrant,
  GRANT_SCOPE_ACTIONS,
  type GrantScopeAction,
  SCHEDULE_RUN_STATUSES,
  type ScheduleRun,
  type ScheduleRunStatus,
  type ScheduleSpec,
} from "./types";
