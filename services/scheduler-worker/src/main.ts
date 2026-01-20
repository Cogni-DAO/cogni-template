// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/scheduler-worker-service/main`
 * Purpose: Service entry point with graceful shutdown.
 * Scope: Composition root that wires adapters and starts worker. Does not contain business logic.
 * Invariants:
 * - Reads config from env (no hardcoded values)
 * - Creates db-client and adapters
 * - Handles SIGTERM/SIGINT for graceful shutdown
 * Side-effects: IO (database, process signals)
 * Links: docs/SCHEDULER_SPEC.md
 * @public
 */

import {
  createDbClient,
  DrizzleExecutionGrantAdapter,
  DrizzleJobQueueAdapter,
  DrizzleScheduleManagerAdapter,
  DrizzleScheduleRunAdapter,
} from "@cogni/db-client";
import pino from "pino";

import { loadConfig } from "./config";
import { startSchedulerWorker } from "./worker";

async function main(): Promise<void> {
  // Load and validate config
  const config = loadConfig();

  // Create logger (composition root owns logger creation)
  const logger = pino({
    level: config.LOG_LEVEL,
    name: config.SERVICE_NAME,
  });

  logger.info({ logLevel: config.LOG_LEVEL }, "Starting scheduler worker");

  // Create database client
  const db = createDbClient(config.DATABASE_URL);

  // Create adapters with injected loggers
  const jobQueueAdapter = new DrizzleJobQueueAdapter(
    db,
    logger.child({ component: "DrizzleJobQueueAdapter" })
  );
  const grantAdapter = new DrizzleExecutionGrantAdapter(
    db,
    logger.child({ component: "DrizzleExecutionGrantAdapter" })
  );
  const runAdapter = new DrizzleScheduleRunAdapter(
    db,
    logger.child({ component: "DrizzleScheduleRunAdapter" })
  );
  const scheduleAdapter = new DrizzleScheduleManagerAdapter(
    db,
    jobQueueAdapter,
    grantAdapter,
    logger.child({ component: "DrizzleScheduleManagerAdapter" })
  );

  // Wire dependencies for worker tasks
  const deps = {
    // ExecuteRunDeps
    getSchedule: async (id: string) => {
      const schedule = await scheduleAdapter.getSchedule(id);
      if (!schedule) return null;
      return {
        id: schedule.id,
        enabled: schedule.enabled,
        cron: schedule.cron,
        timezone: schedule.timezone,
        graphId: schedule.graphId,
        executionGrantId: schedule.executionGrantId,
      };
    },
    validateGrantForGraph: (grantId: string, graphId: string) =>
      grantAdapter.validateGrantForGraph(grantId, graphId),
    createRun: async (params: {
      scheduleId: string;
      runId: string;
      scheduledFor: Date;
    }) => {
      await runAdapter.createRun(params);
    },
    markRunStarted: runAdapter.markRunStarted.bind(runAdapter),
    markRunCompleted: runAdapter.markRunCompleted.bind(runAdapter),
    enqueueJob: jobQueueAdapter.enqueueJob.bind(jobQueueAdapter),
    updateNextRunAt: scheduleAdapter.updateNextRunAt.bind(scheduleAdapter),
    updateLastRunAt: scheduleAdapter.updateLastRunAt.bind(scheduleAdapter),
    // ReconcileDeps
    findStaleSchedules: async () => {
      const schedules = await scheduleAdapter.findStaleSchedules();
      return schedules.map((s) => ({
        id: s.id,
        cron: s.cron,
        timezone: s.timezone,
      }));
    },
  };

  // Start worker
  const worker = await startSchedulerWorker({
    connectionString: config.DATABASE_URL,
    logger,
    deps,
    concurrency: config.WORKER_CONCURRENCY,
    pollInterval: config.WORKER_POLL_INTERVAL,
  });

  logger.info(
    {
      concurrency: config.WORKER_CONCURRENCY,
      pollInterval: config.WORKER_POLL_INTERVAL,
    },
    "Scheduler worker started"
  );

  // Graceful shutdown
  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      logger.warn({ signal }, "Shutdown already in progress");
      return;
    }
    shuttingDown = true;
    logger.info({ signal }, "Received signal, shutting down");

    try {
      await worker.stop();
      logger.info({}, "Scheduler worker stopped");
      process.exit(0);
    } catch (error) {
      logger.error({ error }, "Error during shutdown");
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
