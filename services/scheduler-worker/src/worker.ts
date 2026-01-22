// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/scheduler-worker-service/worker`
 * Purpose: Temporal Worker bootstrap and lifecycle management.
 * Scope: Creates Temporal Worker with activities and workflows. Does not contain business logic.
 * Invariants:
 *   - Per WORKER_NEVER_CONTROLS_SCHEDULES: Does NOT depend on ScheduleControlPort
 *   - Per TEMPORAL_DETERMINISM: Workflows are bundled separately from activities
 *   - Zero imports from src/** (arch compliance)
 *   - All dependencies injected via config
 * Side-effects: IO (connects to Temporal, starts worker)
 * Links: docs/SCHEDULER_SPEC.md, docs/TEMPORAL_PATTERNS.md
 * @internal
 */

import {
  createDbClient,
  DrizzleExecutionGrantAdapter,
  DrizzleScheduleRunAdapter,
} from "@cogni/db-client";
import { NativeConnection, Worker } from "@temporalio/worker";
import type { Logger } from "pino";

import { createActivities } from "./activities/index.js";

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
 * Configuration for starting the Temporal scheduler worker.
 */
export interface SchedulerWorkerConfig {
  /** Temporal server address */
  temporalAddress: string;
  /** Temporal namespace */
  namespace: string;
  /** Temporal task queue */
  taskQueue: string;
  /** PostgreSQL connection string for DB activities */
  databaseUrl: string;
  /** App base URL for internal API calls */
  appBaseUrl: string;
  /** Scheduler API token (treat as secret - never log) */
  schedulerApiToken: string;
  /** Logger instance */
  logger: Logger;
}

/**
 * Starts the Temporal scheduler worker with injected configuration.
 * Returns a cleanup function to stop the worker gracefully.
 */
export async function startSchedulerWorker(
  config: SchedulerWorkerConfig
): Promise<{ shutdown: () => Promise<void> }> {
  const {
    temporalAddress,
    namespace,
    taskQueue,
    databaseUrl,
    appBaseUrl,
    schedulerApiToken,
    logger,
  } = config;

  logger.info(
    { temporalAddress, namespace, taskQueue },
    "Connecting to Temporal"
  );

  // Create Temporal connection
  const connection = await NativeConnection.connect({
    address: temporalAddress,
  });

  // Create database client and adapters for activities
  const db = createDbClient(databaseUrl);
  const grantAdapter = new DrizzleExecutionGrantAdapter(
    db,
    logger.child({ component: "DrizzleExecutionGrantAdapter" })
  );
  const runAdapter = new DrizzleScheduleRunAdapter(
    db,
    logger.child({ component: "DrizzleScheduleRunAdapter" })
  );

  // Create activities with injected deps
  const activities = createActivities({
    db,
    grantAdapter,
    runAdapter,
    config: {
      appBaseUrl,
      schedulerApiToken,
    },
    logger: logger.child({ component: "activities" }),
  });

  // Create Temporal Worker
  // Note: workflowsPath points to the compiled workflow file
  const worker = await Worker.create({
    connection,
    namespace,
    taskQueue,
    workflowsPath: new URL(
      "./workflows/scheduled-run.workflow.js",
      import.meta.url
    ).pathname,
    activities,
  });

  logger.info({ namespace, taskQueue }, "Temporal Worker created");

  // Start the worker (runs in background)
  const runPromise = worker.run();

  // Handle worker errors
  runPromise.catch((err) => {
    logger.error({ err }, "Worker run failed");
  });

  logger.info("Scheduler worker started, polling for tasks");

  // Return shutdown function
  return {
    shutdown: async () => {
      logger.info("Shutting down Temporal Worker");
      worker.shutdown();
      await runPromise;
      await connection.close();
      logger.info("Temporal Worker shutdown complete");
    },
  };
}
