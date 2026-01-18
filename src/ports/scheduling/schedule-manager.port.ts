// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@ports/schedule-manager`
 * Purpose: Schedule manager port for schedule CRUD operations.
 * Scope: Defines contract for schedule lifecycle. Does not contain implementations.
 * Invariants:
 * - createSchedule creates grant + schedule + enqueues first job atomically
 * - Per SCHEDULER_SPEC.md: next_run_at computed from cron + timezone
 * - Schedule access scoped to owner (callerUserId)
 * Side-effects: none (interface definition only)
 * Links: docs/SCHEDULER_SPEC.md, types/scheduling.ts, DrizzleScheduleManagerAdapter
 * @public
 */

import type { ScheduleSpec } from "@/types/scheduling";

// Re-export type for adapter convenience
export type { ScheduleSpec } from "@/types/scheduling";

/**
 * Port-level error thrown when schedule is not found.
 */
export class ScheduleNotFoundError extends Error {
  constructor(public readonly scheduleId: string) {
    super(`Schedule not found: ${scheduleId}`);
    this.name = "ScheduleNotFoundError";
  }
}

/**
 * Port-level error thrown when caller is not authorized to access schedule.
 */
export class ScheduleAccessDeniedError extends Error {
  constructor(
    public readonly scheduleId: string,
    public readonly callerUserId: string
  ) {
    super(`Access denied to schedule ${scheduleId} for user ${callerUserId}`);
    this.name = "ScheduleAccessDeniedError";
  }
}

/**
 * Port-level error thrown when cron expression is invalid.
 */
export class InvalidCronExpressionError extends Error {
  constructor(
    public readonly cron: string,
    public readonly reason: string
  ) {
    super(`Invalid cron expression "${cron}": ${reason}`);
    this.name = "InvalidCronExpressionError";
  }
}

/**
 * Port-level error thrown when timezone is invalid.
 */
export class InvalidTimezoneError extends Error {
  constructor(public readonly timezone: string) {
    super(`Invalid timezone: ${timezone}`);
    this.name = "InvalidTimezoneError";
  }
}

export function isScheduleNotFoundError(
  error: unknown
): error is ScheduleNotFoundError {
  return error instanceof Error && error.name === "ScheduleNotFoundError";
}

export function isScheduleAccessDeniedError(
  error: unknown
): error is ScheduleAccessDeniedError {
  return error instanceof Error && error.name === "ScheduleAccessDeniedError";
}

export function isInvalidCronExpressionError(
  error: unknown
): error is InvalidCronExpressionError {
  return error instanceof Error && error.name === "InvalidCronExpressionError";
}

export function isInvalidTimezoneError(
  error: unknown
): error is InvalidTimezoneError {
  return error instanceof Error && error.name === "InvalidTimezoneError";
}

export interface CreateScheduleInput {
  graphId: string;
  input: unknown;
  cron: string;
  timezone: string;
}

export interface UpdateScheduleInput {
  input?: unknown;
  cron?: string;
  timezone?: string;
  enabled?: boolean;
}

/**
 * Schedule manager port for schedule CRUD operations.
 */
export interface ScheduleManagerPort {
  /**
   * Creates schedule + grant + enqueues first job via JobQueuePort.
   */
  createSchedule(
    callerUserId: string,
    billingAccountId: string,
    input: CreateScheduleInput
  ): Promise<ScheduleSpec>;

  /**
   * Lists schedules owned by caller.
   */
  listSchedules(callerUserId: string): Promise<readonly ScheduleSpec[]>;

  /**
   * Gets schedule by ID (null if not found).
   */
  getSchedule(scheduleId: string): Promise<ScheduleSpec | null>;

  /**
   * Updates schedule. Recomputes next_run_at if cron/timezone/enabled changed.
   * @throws ScheduleNotFoundError, ScheduleAccessDeniedError
   */
  updateSchedule(
    callerUserId: string,
    scheduleId: string,
    patch: UpdateScheduleInput
  ): Promise<ScheduleSpec>;

  /**
   * Deletes schedule and revokes associated grant.
   * @throws ScheduleNotFoundError, ScheduleAccessDeniedError
   */
  deleteSchedule(callerUserId: string, scheduleId: string): Promise<void>;

  /**
   * Updates next_run_at after execution (used by worker).
   */
  updateNextRunAt(scheduleId: string, nextRunAt: Date): Promise<void>;

  /**
   * Updates last_run_at when execution starts (used by worker).
   */
  updateLastRunAt(scheduleId: string, lastRunAt: Date): Promise<void>;

  /**
   * Finds enabled schedules with stale next_run_at (used by reconciler).
   */
  findStaleSchedules(): Promise<readonly ScheduleSpec[]>;
}
