// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/scheduler-worker-service/main`
 * Purpose: Service entry point with graceful shutdown.
 * Scope: Composition root that wires config and starts Temporal worker. Does not contain business logic.
 * Invariants:
 *   - Reads config from env (no hardcoded values)
 *   - Handles SIGTERM/SIGINT for graceful shutdown
 *   - Per READINESS_GATES_LOCALLY: ready=false stops work intake immediately
 * Side-effects: IO (Temporal connection, process signals)
 * Links: docs/SCHEDULER_SPEC.md, docs/SERVICES_ARCHITECTURE.md
 * @public
 */

import { loadConfig } from "./config.js";
import { type HealthState, startHealthServer } from "./health.js";
import { flushLogger, makeLogger } from "./observability/logger.js";
import { startSchedulerWorker } from "./worker.js";

async function main(): Promise<void> {
  // Load and validate config
  const config = loadConfig();

  // Create logger (composition root owns logger creation)
  const logger = makeLogger();

  logger.info(
    { logLevel: config.LOG_LEVEL },
    "Starting Temporal scheduler worker"
  );

  // Health state for readiness probes
  const healthState: HealthState = { ready: false };
  startHealthServer(healthState, config.HEALTH_PORT);
  logger.info({ port: config.HEALTH_PORT }, "Health server started");

  // Start Temporal worker
  const worker = await startSchedulerWorker({
    temporalAddress: config.TEMPORAL_ADDRESS,
    namespace: config.TEMPORAL_NAMESPACE,
    taskQueue: config.TEMPORAL_TASK_QUEUE,
    databaseUrl: config.DATABASE_URL,
    appBaseUrl: config.APP_BASE_URL,
    schedulerApiToken: config.SCHEDULER_API_TOKEN,
    logger,
  });

  // Mark ready after worker starts
  healthState.ready = true;
  logger.info(
    {
      namespace: config.TEMPORAL_NAMESPACE,
      taskQueue: config.TEMPORAL_TASK_QUEUE,
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
      await worker.shutdown();
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
