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

import { eq } from "drizzle-orm";

import type { Database } from "@/adapters/server/db/client";
import type { ScheduleRun, ScheduleRunRepository } from "@/ports";
import { scheduleRuns } from "@/shared/db";
import { makeLogger } from "@/shared/observability";

const logger = makeLogger({ component: "DrizzleScheduleRunAdapter" });

export class DrizzleScheduleRunAdapter implements ScheduleRunRepository {
  constructor(private readonly db: Database) {}

  async createRun(params: {
    scheduleId: string;
    runId: string;
    scheduledFor: Date;
  }): Promise<ScheduleRun> {
    const [row] = await this.db
      .insert(scheduleRuns)
      .values({
        scheduleId: params.scheduleId,
        runId: params.runId,
        scheduledFor: params.scheduledFor,
        status: "pending",
      })
      .returning();

    if (!row) {
      throw new Error("Failed to create run record");
    }

    logger.debug(
      { runId: params.runId, scheduleId: params.scheduleId },
      "Created run record"
    );

    return this.toRun(row);
  }

  async markRunStarted(runId: string, langfuseTraceId?: string): Promise<void> {
    await this.db
      .update(scheduleRuns)
      .set({
        status: "running",
        startedAt: new Date(),
        langfuseTraceId: langfuseTraceId ?? null,
      })
      .where(eq(scheduleRuns.runId, runId));

    logger.debug({ runId }, "Marked run as started");
  }

  async markRunCompleted(
    runId: string,
    status: "success" | "error" | "skipped",
    errorMessage?: string
  ): Promise<void> {
    await this.db
      .update(scheduleRuns)
      .set({
        status,
        completedAt: new Date(),
        errorMessage: errorMessage ?? null,
      })
      .where(eq(scheduleRuns.runId, runId));

    logger.info({ runId, status }, "Marked run as completed");
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
