// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/scheduling/job-queue`
 * Purpose: DrizzleJobQueueAdapter for Graphile Worker job enqueuing.
 * Scope: Implements JobQueuePort with isolated add_job SQL. Does not contain scheduling logic.
 * Invariants:
 * - jobKey provides idempotency via job_key_mode = 'replace'
 * - queueName serializes execution when provided
 * Side-effects: IO (database operations)
 * Links: ports/job-queue.port.ts, docs/SCHEDULER_SPEC.md
 * @public
 */

import type { EnqueueJobParams, JobQueuePort } from "@cogni/scheduler-core";
import { sql } from "drizzle-orm";
import type { Database, LoggerLike } from "../client";

export class DrizzleJobQueueAdapter implements JobQueuePort {
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

  async enqueueJob(params: EnqueueJobParams): Promise<void> {
    const { taskId, payload, runAt, jobKey, queueName } = params;

    // Convert Date to ISO string for PostgreSQL timestamp compatibility
    const runAtIso = runAt.toISOString();

    this.logger.debug({ taskId, jobKey, runAt: runAtIso }, "Enqueuing job");

    // Build payload as JSON string for Graphile Worker
    const payloadJson = JSON.stringify(payload);

    // Casts match graphile_worker.add_job signature (verified via \df):
    // identifier text, payload json, queue_name text, run_at timestamptz,
    // max_attempts int, job_key text, priority int, flags text[], job_key_mode text
    try {
      if (queueName) {
        await this.db.execute(sql`
          SELECT graphile_worker.add_job(
            ${taskId}::text,
            ${payloadJson}::json,
            queue_name => ${queueName}::text,
            run_at => ${runAtIso}::timestamptz,
            job_key => ${jobKey}::text,
            job_key_mode => 'replace'::text
          )
        `);
      } else {
        await this.db.execute(sql`
          SELECT graphile_worker.add_job(
            ${taskId}::text,
            ${payloadJson}::json,
            run_at => ${runAtIso}::timestamptz,
            job_key => ${jobKey}::text,
            job_key_mode => 'replace'::text
          )
        `);
      }

      this.logger.info({ taskId, jobKey }, "Job enqueued");
    } catch (error) {
      // Log the full error including the cause (actual PostgreSQL error)
      const cause =
        error instanceof Error
          ? (error as Error & { cause?: unknown }).cause
          : undefined;
      this.logger.error(
        {
          taskId,
          jobKey,
          error: String(error),
          cause: cause ? String(cause) : undefined,
        },
        "Failed to enqueue job"
      );
      throw error;
    }
  }
}
