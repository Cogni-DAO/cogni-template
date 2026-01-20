// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/scheduler-worker-service/tasks/reconcile`
 * Purpose: Graphile Worker task for reconciling stale schedules.
 * Scope: Finds schedules with stale next_run_at and re-enqueues them. Does not execute graphs.
 * Invariants:
 * - Per RECONCILER_GUARANTEES_CHAIN: Runs on startup + self-reschedules every 5m
 * - Computes next future slot and enqueues with job_key for idempotency
 * Side-effects: IO (database reads, job enqueue via injected deps)
 * Links: docs/SCHEDULER_SPEC.md
 * @internal
 */

import {
  ReconcileSchedulesPayloadSchema,
  SCHEDULER_TASK_IDS,
} from "@cogni/scheduler-core";
import type { Task } from "graphile-worker";

import { computeNextCronTime } from "../utils/cron.js";

const RECONCILE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Creates the reconcile_schedules task with injected dependencies.
 */
export function createReconcileSchedulesTask(deps: {
  findStaleSchedules: () => Promise<
    readonly {
      id: string;
      cron: string;
      timezone: string;
    }[]
  >;
  enqueueJob: (params: {
    taskId: string;
    payload: Record<string, unknown>;
    runAt: Date;
    jobKey: string;
    queueName?: string;
  }) => Promise<void>;
  updateNextRunAt: (scheduleId: string, nextRunAt: Date) => Promise<void>;
  logger: { info(obj: Record<string, unknown>, msg?: string): void };
}): Task {
  return async (payload) => {
    // Validate payload schema (no unsafe casts)
    ReconcileSchedulesPayloadSchema.parse(payload);

    // Find enabled schedules with stale next_run_at
    const staleSchedules = await deps.findStaleSchedules();

    for (const schedule of staleSchedules) {
      const nextRunAt = computeNextCronTime(schedule.cron, schedule.timezone);

      // Enqueue with job_key for idempotency (no duplicates)
      await deps.enqueueJob({
        taskId: SCHEDULER_TASK_IDS.EXECUTE_SCHEDULED_RUN,
        payload: {
          scheduleId: schedule.id,
          scheduledFor: nextRunAt.toISOString(),
        },
        runAt: nextRunAt,
        jobKey: `${schedule.id}:${nextRunAt.toISOString()}`,
        queueName: schedule.id,
      });

      await deps.updateNextRunAt(schedule.id, nextRunAt);
      deps.logger.info(
        { scheduleId: schedule.id, nextRunAt: nextRunAt.toISOString() },
        "Reconciled schedule"
      );
    }

    deps.logger.info(
      { count: staleSchedules.length },
      "Reconciliation complete"
    );

    // Self-reschedule in 5 minutes (per RECONCILER_GUARANTEES_CHAIN)
    await deps.enqueueJob({
      taskId: SCHEDULER_TASK_IDS.RECONCILE_SCHEDULES,
      payload: {},
      runAt: new Date(Date.now() + RECONCILE_INTERVAL_MS),
      jobKey: "reconciler",
    });
  };
}
