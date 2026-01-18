// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@ports/schedule-run`
 * Purpose: Schedule run repository port for execution ledger.
 * Scope: Defines contract for run record persistence. Does not contain implementations.
 * Invariants:
 * - Every scheduled execution creates a run record with status progression
 * - UNIQUE(schedule_id, scheduled_for) prevents duplicate run records per slot
 * - Used by worker task, not by schedule CRUD adapter
 * Side-effects: none (interface definition only)
 * Links: docs/SCHEDULER_SPEC.md, types/scheduling.ts, DrizzleScheduleRunAdapter
 * @public
 */

// Re-export types for adapter convenience
export type { ScheduleRun, ScheduleRunStatus } from "@/types/scheduling";

// Import for local use in interface
import type { ScheduleRun } from "@/types/scheduling";

/**
 * Schedule run repository for execution ledger.
 * Separate from ScheduleManagerPort per P0 feedback.
 */
export interface ScheduleRunRepository {
  /**
   * Creates a run record when job starts executing.
   * Status defaults to 'pending'.
   */
  createRun(params: {
    scheduleId: string;
    runId: string;
    scheduledFor: Date;
  }): Promise<ScheduleRun>;

  /**
   * Marks run as started (status = 'running', sets startedAt).
   */
  markRunStarted(runId: string, langfuseTraceId?: string): Promise<void>;

  /**
   * Marks run as completed with final status.
   */
  markRunCompleted(
    runId: string,
    status: "success" | "error" | "skipped",
    errorMessage?: string
  ): Promise<void>;
}
