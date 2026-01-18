// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@ports/scheduling`
 * Purpose: Scheduling ports barrel export.
 * Scope: Re-exports all scheduling port interfaces and errors. Does not contain implementations.
 * Invariants: All exports are interfaces or error classes only.
 * Side-effects: none
 * Links: docs/SCHEDULER_SPEC.md
 * @public
 */

export {
  type ExecutionGrant,
  type ExecutionGrantPort,
  GrantExpiredError,
  GrantNotFoundError,
  GrantRevokedError,
  GrantScopeMismatchError,
  isGrantExpiredError,
  isGrantNotFoundError,
  isGrantRevokedError,
  isGrantScopeMismatchError,
} from "./execution-grant.port";
export type { EnqueueJobParams, JobQueuePort } from "./job-queue.port";
export {
  type CreateScheduleInput,
  InvalidCronExpressionError,
  InvalidTimezoneError,
  isInvalidCronExpressionError,
  isInvalidTimezoneError,
  isScheduleAccessDeniedError,
  isScheduleNotFoundError,
  ScheduleAccessDeniedError,
  type ScheduleManagerPort,
  ScheduleNotFoundError,
  type ScheduleSpec,
  type UpdateScheduleInput,
} from "./schedule-manager.port";
export type {
  ScheduleRun,
  ScheduleRunRepository,
  ScheduleRunStatus,
} from "./schedule-run.port";
