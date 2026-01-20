// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/scheduler-worker-service/tasks/execute-run`
 * Purpose: Graphile Worker task for executing scheduled graph runs.
 * Scope: Loads schedule, validates grant, creates run record, enqueues next run. Does not contain graph execution logic.
 * Invariants:
 * - Per RUN_LEDGER_FOR_GOVERNANCE: Every execution creates a run record
 * - Per PRODUCER_ENQUEUES_NEXT: Enqueues next run after completion
 * Side-effects: IO (database writes via injected deps)
 * Links: docs/SCHEDULER_SPEC.md
 * @internal
 *
 * NOTE: v0 stub - marks run as success without executing graph.
 * Graph execution via POST /api/internal/graphs/{graphId}:run deferred to next PR.
 */

import { randomUUID } from "node:crypto";
import {
  ExecuteScheduledRunPayloadSchema,
  SCHEDULER_TASK_IDS,
} from "@cogni/scheduler-core";
import type { Task } from "graphile-worker";

import { computeNextCronTime } from "../utils/cron.js";

/**
 * Creates the execute_scheduled_run task with injected dependencies.
 *
 * v0: Stub implementation that logs and marks run as complete.
 * Next PR will add HTTP call to graph execution endpoint.
 */
export function createExecuteScheduledRunTask(deps: {
  getSchedule: (id: string) => Promise<{
    id: string;
    enabled: boolean;
    cron: string;
    timezone: string;
    graphId: string;
    executionGrantId: string;
  } | null>;
  validateGrantForGraph: (
    grantId: string,
    graphId: string
  ) => Promise<{
    id: string;
    userId: string;
    billingAccountId: string;
    scopes: readonly string[];
    expiresAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
  }>;
  createRun: (params: {
    scheduleId: string;
    runId: string;
    scheduledFor: Date;
  }) => Promise<void>;
  markRunStarted: (runId: string) => Promise<void>;
  markRunCompleted: (
    runId: string,
    status: "success" | "error" | "skipped",
    errorMessage?: string
  ) => Promise<void>;
  enqueueJob: (params: {
    taskId: string;
    payload: Record<string, unknown>;
    runAt: Date;
    jobKey: string;
    queueName?: string;
  }) => Promise<void>;
  updateNextRunAt: (scheduleId: string, nextRunAt: Date) => Promise<void>;
  updateLastRunAt: (scheduleId: string, lastRunAt: Date) => Promise<void>;
  logger: {
    info(obj: Record<string, unknown>, msg?: string): void;
    error(obj: Record<string, unknown>, msg?: string): void;
  };
}): Task {
  return async (payload) => {
    // Validate payload schema (no unsafe casts)
    const { scheduleId, scheduledFor } =
      ExecuteScheduledRunPayloadSchema.parse(payload);
    const scheduledForDate = new Date(scheduledFor);

    // 1. Load schedule
    const schedule = await deps.getSchedule(scheduleId);
    if (!schedule || !schedule.enabled) {
      deps.logger.info(
        { scheduleId },
        "Schedule disabled or deleted, skipping"
      );
      return;
    }

    // 2. Create run record (RUN_LEDGER_FOR_GOVERNANCE)
    const runId = randomUUID();
    await deps.createRun({ scheduleId, runId, scheduledFor: scheduledForDate });

    // 3. Validate grant before execution (GRANT_SCOPES_CONSTRAIN_GRAPHS)
    try {
      await deps.validateGrantForGraph(
        schedule.executionGrantId,
        schedule.graphId
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Grant validation failed";
      deps.logger.info(
        { scheduleId, runId, error: errorMessage },
        "Grant validation failed, skipping run"
      );
      await deps.markRunCompleted(runId, "skipped", errorMessage);
      // Still enqueue next run so schedule keeps ticking
      const nextRunAt = computeNextCronTime(schedule.cron, schedule.timezone);
      await deps.enqueueJob({
        taskId: SCHEDULER_TASK_IDS.EXECUTE_SCHEDULED_RUN,
        payload: { scheduleId, scheduledFor: nextRunAt.toISOString() },
        runAt: nextRunAt,
        jobKey: `${scheduleId}:${nextRunAt.toISOString()}`,
        queueName: scheduleId,
      });
      await deps.updateNextRunAt(scheduleId, nextRunAt);
      return;
    }

    // 4. Mark run as started and update last_run_at
    await deps.markRunStarted(runId);
    await deps.updateLastRunAt(scheduleId, new Date());

    // 5. v0 STUB: Mark as success without executing graph
    // TODO: Next PR - call POST /api/internal/graphs/{graphId}:run
    await deps.markRunCompleted(runId, "success");
    deps.logger.info(
      { scheduleId, runId },
      "Scheduled run completed (v0 stub - no graph execution)"
    );

    // 6. Enqueue next run (PRODUCER_ENQUEUES_NEXT)
    const nextRunAt = computeNextCronTime(schedule.cron, schedule.timezone);
    await deps.enqueueJob({
      taskId: SCHEDULER_TASK_IDS.EXECUTE_SCHEDULED_RUN,
      payload: { scheduleId, scheduledFor: nextRunAt.toISOString() },
      runAt: nextRunAt,
      jobKey: `${scheduleId}:${nextRunAt.toISOString()}`,
      queueName: scheduleId,
    });
    await deps.updateNextRunAt(scheduleId, nextRunAt);
  };
}
