// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/scheduling/drizzle-run`
 * Purpose: DrizzleScheduleRunAdapter for schedule run ledger persistence.
 * Scope: Implements ScheduleRunRepository with Drizzle ORM. Does not contain scheduling logic.
 * Invariants:
 * - Per RUN_LEDGER_FOR_GOVERNANCE: Every execution creates a run record
 * - UNIQUE(schedule_id, scheduled_for) prevents duplicate runs per slot
 * Side-effects: IO (database operations)
 * Links: ports/scheduling/schedule-run.port.ts, docs/SCHEDULER_SPEC.md
 * @public
 */

import { scheduleRuns } from "@cogni/db-schema/scheduling";

import type { ScheduleRun, ScheduleRunRepository } from "@cogni/scheduler-core";
import { and, eq, inArray } from "drizzle-orm";
import type { Database, LoggerLike } from "../client";

export class DrizzleScheduleRunAdapter implements ScheduleRunRepository {
  private readonly logger: LoggerLike;

  constructor(
    private readonly db: Database,
    logger?: LoggerLike
  ) {
    this.logger = logger ?? {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    };
  }

  /**
   * Creates a schedule run record with idempotent semantics.
   * Per SCHEDULER_SPEC.md pattern: INSERT ON CONFLICT DO NOTHING + SELECT.
   * UNIQUE(schedule_id, scheduled_for) prevents duplicate runs per slot.
   */
  async createRun(params: {
    scheduleId: string;
    runId: string;
    scheduledFor: Date;
  }): Promise<ScheduleRun> {
    // Idempotent insert - does nothing if (schedule_id, scheduled_for) exists
    await this.db
      .insert(scheduleRuns)
      .values({
        scheduleId: params.scheduleId,
        runId: params.runId,
        scheduledFor: params.scheduledFor,
        status: "pending",
      })
      .onConflictDoNothing({
        target: [scheduleRuns.scheduleId, scheduleRuns.scheduledFor],
      });

    // Always SELECT to get the row (new or existing)
    const [row] = await this.db
      .select()
      .from(scheduleRuns)
      .where(
        and(
          eq(scheduleRuns.scheduleId, params.scheduleId),
          eq(scheduleRuns.scheduledFor, params.scheduledFor)
        )
      );

    if (!row) {
      throw new Error("Failed to create or retrieve run record");
    }

    this.logger.debug(
      { runId: row.runId, scheduleId: params.scheduleId },
      "Created or retrieved run record"
    );

    return this.toRun(row);
  }

  /**
   * Marks a run as started. Monotonic: only transitions from 'pending'.
   * Idempotent on retry - no-op if already running/completed.
   */
  async markRunStarted(runId: string, langfuseTraceId?: string): Promise<void> {
    // Monotonic guard: only update if status='pending' (prevents regression)
    await this.db
      .update(scheduleRuns)
      .set({
        status: "running",
        startedAt: new Date(),
        langfuseTraceId: langfuseTraceId ?? null,
      })
      .where(
        and(eq(scheduleRuns.runId, runId), eq(scheduleRuns.status, "pending"))
      );

    this.logger.debug({ runId }, "Marked run as started");
  }

  /**
   * Marks a run as completed. Monotonic: only transitions from 'pending' or 'running'.
   * Idempotent on retry - no-op if already in terminal state.
   */
  async markRunCompleted(
    runId: string,
    status: "success" | "error" | "skipped",
    errorMessage?: string
  ): Promise<void> {
    // Monotonic guard: only update if status is pending/running (prevents regression)
    await this.db
      .update(scheduleRuns)
      .set({
        status,
        completedAt: new Date(),
        errorMessage: errorMessage ?? null,
      })
      .where(
        and(
          eq(scheduleRuns.runId, runId),
          inArray(scheduleRuns.status, ["pending", "running"])
        )
      );

    this.logger.info({ runId, status }, "Marked run as completed");
  }

  private toRun(row: typeof scheduleRuns.$inferSelect): ScheduleRun {
    return {
      id: row.id,
      scheduleId: row.scheduleId,
      runId: row.runId,
      scheduledFor: row.scheduledFor,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      status: row.status,
      attemptCount: row.attemptCount,
      langfuseTraceId: row.langfuseTraceId,
      errorMessage: row.errorMessage,
    };
  }
}
