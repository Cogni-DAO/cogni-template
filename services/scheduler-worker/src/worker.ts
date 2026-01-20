// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/scheduler-worker-service/worker`
 * Purpose: Graphile Worker bootstrap and lifecycle management.
 * Scope: Starts worker with injected dependencies, handles shutdown. Does not contain task logic.
 * Invariants:
 * - Zero imports from src/** (arch compliance)
 * - All dependencies injected via config
 * - Runs reconciler on startup (per RECONCILER_GUARANTEES_CHAIN)
 * Side-effects: IO (starts Graphile Worker process)
 * Links: docs/SCHEDULER_SPEC.md
 * @internal
 */

import { type Runner, run, type TaskList } from "graphile-worker";

import { createExecuteScheduledRunTask } from "./tasks/execute-run";
import { createReconcileSchedulesTask } from "./tasks/reconcile";

/**
 * Logger interface expected by the worker.
 * Compatible with pino's Logger type.
 */
export interface LoggerLike {
  info(obj: Record<string, unknown>, msg?: string): void;
  warn(obj: Record<string, unknown>, msg?: string): void;
  error(obj: Record<string, unknown>, msg?: string): void;
  debug?(obj: Record<string, unknown>, msg?: string): void;
  child?(bindings: Record<string, unknown>): LoggerLike;
}

/**
 * Dependencies for executing scheduled graph runs.
 * These map to port operations provided by the main app.
 *
 * v0: Simplified deps - no graph execution (stub marks as success).
 * Next PR will add runGraph dep when graph execution endpoint is ready.
 */
export interface ExecuteRunDeps {
  getSchedule: (id: string) => Promise<{
    id: string;
    enabled: boolean;
    cron: string;
    timezone: string;
    graphId: string;
    executionGrantId: string;
  } | null>;
  /**
   * Validates grant is not expired/revoked and authorizes the graph.
   * Per GRANT_SCOPES_CONSTRAIN_GRAPHS: must be called before execution.
   * Returns validated grant (worker may ignore if not needed).
   * @throws Error on validation failure (not found, expired, revoked, scope mismatch)
   */
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
}

/**
 * Dependencies for reconciling stale schedules.
 */
export interface ReconcileDeps {
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
}

/**
 * Configuration for starting the scheduler worker.
 */
export interface SchedulerWorkerConfig {
  /** PostgreSQL connection string */
  connectionString: string;
  /** Logger instance */
  logger: LoggerLike;
  /** Dependencies for task execution */
  deps: ExecuteRunDeps & ReconcileDeps;
  /** Worker concurrency (default: 5) */
  concurrency?: number;
  /** Poll interval in ms (default: 1000) */
  pollInterval?: number;
}

/**
 * Starts the scheduler worker with injected dependencies.
 * Returns a cleanup function to stop the worker gracefully.
 */
export async function startSchedulerWorker(
  config: SchedulerWorkerConfig
): Promise<{ stop: () => Promise<void> }> {
  const {
    connectionString,
    logger,
    deps,
    concurrency = 5,
    pollInterval = 1000,
  } = config;

  logger.info({}, "Starting scheduler worker");

  // Create task list with injected deps
  const taskList: TaskList = {
    execute_scheduled_run: createExecuteScheduledRunTask({
      ...deps,
      logger,
    }),
    reconcile_schedules: createReconcileSchedulesTask({
      ...deps,
      logger,
    }),
  };

  // Start Graphile Worker
  const runner: Runner = await run({
    connectionString,
    taskList,
    concurrency,
    pollInterval,
  });

  // Trigger initial reconciliation on startup (per RECONCILER_GUARANTEES_CHAIN)
  logger.info({}, "Running initial reconciliation");
  await runner.addJob(
    "reconcile_schedules",
    {},
    { jobKey: "reconciler", jobKeyMode: "replace" }
  );

  logger.info({}, "Scheduler worker started");

  // Return cleanup function
  return {
    stop: async () => {
      logger.info({}, "Stopping scheduler worker");
      await runner.stop();
    },
  };
}
