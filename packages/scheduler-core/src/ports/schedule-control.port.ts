// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@ports/schedule-control`
 * Purpose: Vendor-agnostic port for schedule lifecycle control (create/pause/resume/delete).
 * Scope: Defines contract for schedule orchestration. Does not contain implementations or vendor imports.
 * Invariants:
 *   - Per CRUD_IS_TEMPORAL_AUTHORITY: CRUD endpoints control schedule lifecycle, worker never modifies schedules
 *   - Per WORKER_NEVER_CONTROLS_SCHEDULES: Worker must not depend on this port
 *   - createSchedule throws on conflict (caller-supplied scheduleId)
 *   - deleteSchedule is idempotent (no-op if not found)
 *   - pause/resume are idempotent (no-op if already in target state)
 * Side-effects: none (interface definition only)
 * Links: docs/SCHEDULER_SPEC.md, docs/TEMPORAL_PATTERNS.md
 * @public
 */

import type { JsonValue } from "type-fest";

/**
 * Parameters for creating a schedule.
 * The scheduleId is caller-supplied (matches DB UUID).
 */
export interface CreateScheduleParams {
  /** Schedule ID (caller-supplied, matches DB UUID) */
  readonly scheduleId: string;
  /** Cron expression (5-field) */
  readonly cron: string;
  /** IANA timezone */
  readonly timezone: string;
  /** Graph ID to execute */
  readonly graphId: string;
  /** Execution grant ID for authorization */
  readonly executionGrantId: string;
  /** Graph input payload (JSON-serializable) */
  readonly input: JsonValue;
}

/**
 * Schedule description returned by describeSchedule.
 * Dates are ISO strings for serialization safety.
 */
export interface ScheduleDescription {
  /** Schedule ID */
  readonly scheduleId: string;
  /** Next scheduled run time (ISO string), null if paused/none */
  readonly nextRunAtIso: string | null;
  /** Last run time (ISO string), null if never run */
  readonly lastRunAtIso: string | null;
  /** Whether schedule is paused */
  readonly isPaused: boolean;
}

/**
 * Error thrown when schedule control backend is unavailable.
 * Maps to: connection errors, timeouts, service unavailable.
 * CRUD layer should return 503 and rollback DB changes.
 */
export class ScheduleControlUnavailableError extends Error {
  constructor(
    public readonly operation: string,
    public readonly cause?: Error
  ) {
    super(
      `Schedule control unavailable during ${operation}: ${cause?.message ?? "unknown error"}`
    );
    this.name = "ScheduleControlUnavailableError";
  }
}

/**
 * Error thrown when schedule already exists (createSchedule conflict).
 * CRUD layer should rollback DB changes.
 */
export class ScheduleControlConflictError extends Error {
  constructor(public readonly scheduleId: string) {
    super(`Schedule already exists: ${scheduleId}`);
    this.name = "ScheduleControlConflictError";
  }
}

/**
 * Error thrown when schedule not found (pause/resume on non-existent schedule).
 * Note: deleteSchedule is idempotent and does NOT throw this error.
 */
export class ScheduleControlNotFoundError extends Error {
  constructor(public readonly scheduleId: string) {
    super(`Schedule not found: ${scheduleId}`);
    this.name = "ScheduleControlNotFoundError";
  }
}

export function isScheduleControlUnavailableError(
  error: unknown
): error is ScheduleControlUnavailableError {
  return (
    error instanceof Error && error.name === "ScheduleControlUnavailableError"
  );
}

export function isScheduleControlConflictError(
  error: unknown
): error is ScheduleControlConflictError {
  return (
    error instanceof Error && error.name === "ScheduleControlConflictError"
  );
}

export function isScheduleControlNotFoundError(
  error: unknown
): error is ScheduleControlNotFoundError {
  return (
    error instanceof Error && error.name === "ScheduleControlNotFoundError"
  );
}

/**
 * Vendor-agnostic port for schedule lifecycle control.
 *
 * Per CRUD_IS_TEMPORAL_AUTHORITY: This port is used ONLY by CRUD endpoints.
 * Per WORKER_NEVER_CONTROLS_SCHEDULES: Worker service must NOT depend on this port.
 *
 * Idempotency semantics:
 * | Method           | Idempotent? | On Not Found                    | On Already Exists              |
 * |------------------|-------------|---------------------------------|--------------------------------|
 * | createSchedule   | No          | N/A                             | Throw ScheduleControlConflict  |
 * | pauseSchedule    | Yes         | Throw ScheduleControlNotFound   | No-op if already paused        |
 * | resumeSchedule   | Yes         | Throw ScheduleControlNotFound   | No-op if already running       |
 * | deleteSchedule   | Yes         | No-op (success)                 | N/A                            |
 * | describeSchedule | Yes         | Return null                     | N/A                            |
 */
export interface ScheduleControlPort {
  /**
   * Creates a new schedule.
   *
   * @param params - Schedule configuration (scheduleId is caller-supplied)
   * @throws ScheduleControlConflictError if schedule already exists
   * @throws ScheduleControlUnavailableError if backend unavailable
   */
  createSchedule(params: CreateScheduleParams): Promise<void>;

  /**
   * Pauses a schedule (stops future runs).
   * Idempotent: no-op if already paused.
   *
   * @param scheduleId - Schedule to pause
   * @throws ScheduleControlNotFoundError if schedule doesn't exist
   * @throws ScheduleControlUnavailableError if backend unavailable
   */
  pauseSchedule(scheduleId: string): Promise<void>;

  /**
   * Resumes a paused schedule.
   * Idempotent: no-op if already running.
   *
   * @param scheduleId - Schedule to resume
   * @throws ScheduleControlNotFoundError if schedule doesn't exist
   * @throws ScheduleControlUnavailableError if backend unavailable
   */
  resumeSchedule(scheduleId: string): Promise<void>;

  /**
   * Deletes a schedule.
   * Idempotent: no-op if schedule doesn't exist.
   *
   * @param scheduleId - Schedule to delete
   * @throws ScheduleControlUnavailableError if backend unavailable
   */
  deleteSchedule(scheduleId: string): Promise<void>;

  /**
   * Describes a schedule's current state.
   *
   * @param scheduleId - Schedule to describe
   * @returns Schedule description or null if not found
   * @throws ScheduleControlUnavailableError if backend unavailable
   */
  describeSchedule(scheduleId: string): Promise<ScheduleDescription | null>;
}
