// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/scheduling/drizzle-schedule`
 * Purpose: DrizzleScheduleManagerAdapter for schedule CRUD operations.
 * Scope: Implements ScheduleManagerPort with Drizzle ORM and ScheduleControlPort for orchestration. Does not contain worker task logic.
 * Invariants:
 * - Per CRUD_IS_TEMPORAL_AUTHORITY: CRUD endpoints control schedule lifecycle
 * - createSchedule: grant → DB → scheduleControl (on fail: rollback)
 * - updateSchedule (enabled): DB → pause/resume (on fail: rollback DB)
 * - deleteSchedule: scheduleControl → DB (on fail: 503, don't delete DB)
 * - Per DB_TIMING_IS_CACHE_ONLY: next_run_at/last_run_at are cache columns
 * Side-effects: IO (database operations, schedule control RPC)
 * Links: ports/scheduling/schedule-manager.port.ts, docs/SCHEDULER_SPEC.md
 * @public
 */

import { schedules } from "@cogni/db-schema/scheduling";
import {
  type CreateScheduleInput,
  type ExecutionGrantPort,
  InvalidCronExpressionError,
  InvalidTimezoneError,
  ScheduleAccessDeniedError,
  type ScheduleControlPort,
  type ScheduleManagerPort,
  ScheduleNotFoundError,
  type ScheduleSpec,
  type UpdateScheduleInput,
} from "@cogni/scheduler-core";
import cronParser from "cron-parser";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import type { JsonValue } from "type-fest";
import type { Database, LoggerLike } from "../client";

export class DrizzleScheduleManagerAdapter implements ScheduleManagerPort {
  private readonly logger: LoggerLike;

  constructor(
    private readonly db: Database,
    private readonly scheduleControl: ScheduleControlPort,
    private readonly grantPort: ExecutionGrantPort,
    logger?: LoggerLike
  ) {
    this.logger = logger ?? {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    };
  }

  async createSchedule(
    callerUserId: string,
    billingAccountId: string,
    input: CreateScheduleInput
  ): Promise<ScheduleSpec> {
    // Validate cron and timezone first (fail fast)
    const nextRunAt = this.computeNextRun(input.cron, input.timezone);

    // Create grant OUTSIDE transaction for atomicity cleanup
    // If schedule insert or scheduleControl fails, we hard-delete the grant
    const grant = await this.grantPort.createGrant({
      userId: callerUserId,
      billingAccountId,
      scopes: [`graph:execute:${input.graphId}`],
    });

    let row: typeof schedules.$inferSelect | undefined;

    try {
      // Insert schedule into DB
      row = await this.db.transaction(async (tx) => {
        const [scheduleRow] = await tx
          .insert(schedules)
          .values({
            ownerUserId: callerUserId,
            executionGrantId: grant.id,
            graphId: input.graphId,
            input: input.input,
            cron: input.cron,
            timezone: input.timezone,
            enabled: true,
            nextRunAt,
          })
          .returning();

        if (!scheduleRow) {
          throw new Error("Failed to insert schedule");
        }
        return scheduleRow;
      });

      // Per CRUD_IS_TEMPORAL_AUTHORITY: Create schedule in orchestrator
      // Order: grant → DB → scheduleControl (on fail: rollback DB and grant)
      await this.scheduleControl.createSchedule({
        scheduleId: row.id,
        cron: input.cron,
        timezone: input.timezone,
        graphId: input.graphId,
        executionGrantId: grant.id,
        input: input.input as JsonValue,
      });

      this.logger.info(
        { scheduleId: row.id, graphId: input.graphId, nextRunAt },
        "Created schedule"
      );

      return this.toSpec(row);
    } catch (error) {
      // Atomicity cleanup: delete DB row if it was created
      if (row) {
        this.logger.warn(
          { scheduleId: row.id },
          "Rolling back schedule DB row after scheduleControl failure"
        );
        await this.db.delete(schedules).where(eq(schedules.id, row.id));
      }

      // Atomicity cleanup: hard-delete the orphan grant
      this.logger.warn(
        { grantId: grant.id },
        "Cleaning up orphan grant after schedule creation failure"
      );
      await this.grantPort.deleteGrant(grant.id);
      throw error;
    }
  }

  async listSchedules(callerUserId: string): Promise<readonly ScheduleSpec[]> {
    const rows = await this.db.query.schedules.findMany({
      where: eq(schedules.ownerUserId, callerUserId),
    });

    return rows.map((row) => this.toSpec(row));
  }

  async getSchedule(scheduleId: string): Promise<ScheduleSpec | null> {
    const row = await this.db.query.schedules.findFirst({
      where: eq(schedules.id, scheduleId),
    });

    return row ? this.toSpec(row) : null;
  }

  async updateSchedule(
    callerUserId: string,
    scheduleId: string,
    patch: UpdateScheduleInput
  ): Promise<ScheduleSpec> {
    const existing = await this.getSchedule(scheduleId);
    if (!existing) {
      throw new ScheduleNotFoundError(scheduleId);
    }
    if (existing.ownerUserId !== callerUserId) {
      throw new ScheduleAccessDeniedError(scheduleId, callerUserId);
    }

    const updates: Partial<typeof schedules.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (patch.input !== undefined) {
      updates.input = patch.input;
    }
    if (patch.cron !== undefined) {
      updates.cron = patch.cron;
    }
    if (patch.timezone !== undefined) {
      updates.timezone = patch.timezone;
    }
    if (patch.enabled !== undefined) {
      updates.enabled = patch.enabled;
    }

    // Recompute next_run_at if cron/timezone/enabled changed
    // Per DB_TIMING_IS_CACHE_ONLY: This is cache-only, Temporal is authoritative
    const newCron = patch.cron ?? existing.cron;
    const newTimezone = patch.timezone ?? existing.timezone;
    const newEnabled = patch.enabled ?? existing.enabled;

    if (newEnabled) {
      updates.nextRunAt = this.computeNextRun(newCron, newTimezone);
    } else {
      updates.nextRunAt = null;
    }

    // Update DB first
    const [row] = await this.db
      .update(schedules)
      .set(updates)
      .where(eq(schedules.id, scheduleId))
      .returning();

    if (!row) {
      throw new ScheduleNotFoundError(scheduleId);
    }

    // Per CRUD_IS_TEMPORAL_AUTHORITY: Handle enabled state changes
    // Order: DB → scheduleControl (on fail: rollback DB)
    try {
      if (patch.enabled !== undefined && patch.enabled !== existing.enabled) {
        if (patch.enabled) {
          // Enabling: resume the schedule
          await this.scheduleControl.resumeSchedule(scheduleId);
          this.logger.info({ scheduleId }, "Resumed schedule");
        } else {
          // Disabling: pause the schedule
          await this.scheduleControl.pauseSchedule(scheduleId);
          this.logger.info({ scheduleId }, "Paused schedule");
        }
      }
    } catch (error) {
      // Rollback DB changes on scheduleControl failure
      this.logger.warn(
        { scheduleId, error },
        "Rolling back schedule update after scheduleControl failure"
      );
      await this.db
        .update(schedules)
        .set({
          input: existing.input,
          cron: existing.cron,
          timezone: existing.timezone,
          enabled: existing.enabled,
          nextRunAt: existing.nextRunAt,
          updatedAt: existing.updatedAt,
        })
        .where(eq(schedules.id, scheduleId));
      throw error;
    }

    this.logger.info({ scheduleId, patch }, "Updated schedule");

    return this.toSpec(row);
  }

  async deleteSchedule(
    callerUserId: string,
    scheduleId: string
  ): Promise<void> {
    const existing = await this.getSchedule(scheduleId);
    if (!existing) {
      throw new ScheduleNotFoundError(scheduleId);
    }
    if (existing.ownerUserId !== callerUserId) {
      throw new ScheduleAccessDeniedError(scheduleId, callerUserId);
    }

    // Per CRUD_IS_TEMPORAL_AUTHORITY: Delete from scheduleControl FIRST
    // Order: scheduleControl → DB (on fail: 503, don't delete DB)
    // Note: scheduleControl.deleteSchedule is idempotent (no-op if not found)
    await this.scheduleControl.deleteSchedule(scheduleId);

    // Only delete from DB if scheduleControl succeeded
    await this.db.transaction(async (tx) => {
      // Revoke the grant
      await this.grantPort.revokeGrant(existing.executionGrantId);

      // Delete schedule (cascade deletes runs)
      await tx.delete(schedules).where(eq(schedules.id, scheduleId));
    });

    this.logger.info({ scheduleId }, "Deleted schedule");
  }

  async updateNextRunAt(scheduleId: string, nextRunAt: Date): Promise<void> {
    await this.db
      .update(schedules)
      .set({ nextRunAt, updatedAt: new Date() })
      .where(eq(schedules.id, scheduleId));
  }

  async updateLastRunAt(scheduleId: string, lastRunAt: Date): Promise<void> {
    await this.db
      .update(schedules)
      .set({ lastRunAt, updatedAt: new Date() })
      .where(eq(schedules.id, scheduleId));
  }

  async findStaleSchedules(): Promise<readonly ScheduleSpec[]> {
    const now = new Date();
    // Per RECONCILER_GUARANTEES_CHAIN: Include enabled schedules where
    // next_run_at IS NULL (edge case after re-enable) or next_run_at < now (stale)
    const rows = await this.db.query.schedules.findMany({
      where: and(
        eq(schedules.enabled, true),
        or(lt(schedules.nextRunAt, now), isNull(schedules.nextRunAt))
      ),
    });

    return rows.map((row) => this.toSpec(row));
  }

  private computeNextRun(cron: string, timezone: string): Date {
    // Validate timezone first (fail fast with clear domain error)
    if (!this.isValidTimezone(timezone)) {
      throw new InvalidTimezoneError(timezone);
    }

    try {
      const interval = cronParser.parseExpression(cron, {
        currentDate: new Date(),
        tz: timezone,
      });
      return interval.next().toDate();
    } catch (error) {
      if (error instanceof Error) {
        throw new InvalidCronExpressionError(cron, error.message);
      }
      throw error;
    }
  }

  private isValidTimezone(timezone: string): boolean {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }

  private toSpec(row: typeof schedules.$inferSelect): ScheduleSpec {
    return {
      id: row.id,
      ownerUserId: row.ownerUserId,
      executionGrantId: row.executionGrantId,
      graphId: row.graphId,
      input: row.input,
      cron: row.cron,
      timezone: row.timezone,
      enabled: row.enabled,
      nextRunAt: row.nextRunAt,
      lastRunAt: row.lastRunAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
