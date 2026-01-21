// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/temporal/noop-schedule-control`
 * Purpose: No-op implementation of ScheduleControlPort for test mode.
 * Scope: Implements ScheduleControlPort with in-memory state tracking. Does not make external calls.
 * Invariants:
 *   - Per APP_ENV=test: Used when Temporal infrastructure is not available
 *   - Maintains in-memory state for test assertions
 *   - Follows same idempotency semantics as real adapter
 * Side-effects: none (in-memory only)
 * Links: docs/SCHEDULER_SPEC.md, ScheduleControlPort
 * @public
 */

import {
  type CreateScheduleParams,
  ScheduleControlConflictError,
  ScheduleControlNotFoundError,
  type ScheduleControlPort,
  type ScheduleDescription,
} from "@cogni/scheduler-core";

interface InMemorySchedule {
  params: CreateScheduleParams;
  isPaused: boolean;
  createdAt: Date;
}

/**
 * No-op implementation of ScheduleControlPort for test mode.
 * Tracks schedules in memory for test assertions.
 */
export class NoOpScheduleControlAdapter implements ScheduleControlPort {
  private readonly schedules = new Map<string, InMemorySchedule>();

  async createSchedule(params: CreateScheduleParams): Promise<void> {
    if (this.schedules.has(params.scheduleId)) {
      throw new ScheduleControlConflictError(params.scheduleId);
    }

    this.schedules.set(params.scheduleId, {
      params,
      isPaused: false,
      createdAt: new Date(),
    });
  }

  async pauseSchedule(scheduleId: string): Promise<void> {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      throw new ScheduleControlNotFoundError(scheduleId);
    }
    // Idempotent: no-op if already paused
    schedule.isPaused = true;
  }

  async resumeSchedule(scheduleId: string): Promise<void> {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      throw new ScheduleControlNotFoundError(scheduleId);
    }
    // Idempotent: no-op if already running
    schedule.isPaused = false;
  }

  async deleteSchedule(scheduleId: string): Promise<void> {
    // Idempotent: no-op if not found
    this.schedules.delete(scheduleId);
  }

  async describeSchedule(
    scheduleId: string
  ): Promise<ScheduleDescription | null> {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      return null;
    }

    return {
      scheduleId,
      nextRunAtIso: schedule.isPaused ? null : new Date().toISOString(),
      lastRunAtIso: null,
      isPaused: schedule.isPaused,
    };
  }

  /**
   * Test helper: Clear all schedules.
   */
  clear(): void {
    this.schedules.clear();
  }

  /**
   * Test helper: Get all schedules for assertions.
   */
  getSchedules(): ReadonlyMap<string, InMemorySchedule> {
    return this.schedules;
  }
}
