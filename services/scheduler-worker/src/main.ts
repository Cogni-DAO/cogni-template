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

import { loadConfig } from "./config.js";
import { type HealthState, startHealthServer } from "./health.js";
import { flushLogger, makeLogger } from "./observability/logger.js";
import { startSchedulerWorker } from "./worker.js";

async function main(): Promise<void> {
  // Load and validate config
  const config = loadConfig();

  // Create logger (composition root owns logger creation)
  const logger = makeLogger();

  logger.info({ logLevel: config.LOG_LEVEL }, "Starting scheduler worker");

  // Health state for readiness probes
  const healthState: HealthState = { ready: false };
  startHealthServer(healthState, config.HEALTH_PORT);
  logger.info({ port: config.HEALTH_PORT }, "Health server started");

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

  // Mark ready after worker starts
  healthState.ready = true;
  logger.info(
    {
      concurrency: config.WORKER_CONCURRENCY,
      pollInterval: config.WORKER_POLL_INTERVAL,
    },
    "Scheduler worker started, ready for traffic"
  );

  // Graceful shutdown
  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      logger.warn({ signal }, "Shutdown already in progress");
      return;
    }
    shuttingDown = true;
    healthState.ready = false; // Stop accepting new work
    logger.info({ signal }, "Received signal, shutting down");

    try {
      await worker.stop();
      logger.info("Scheduler worker stopped");
      flushLogger();
      process.exit(0);
    } catch (err) {
      logger.error({ err }, "Error during shutdown");
      flushLogger();
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

const bootLogger = makeLogger({ phase: "boot" });

main().catch((err) => {
  bootLogger.fatal({ err }, "Fatal error during startup");
  flushLogger();
  process.exit(1);
});
