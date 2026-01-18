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

import { sql } from "drizzle-orm";

import type { Database } from "@/adapters/server/db/client";
import type { EnqueueJobParams, JobQueuePort } from "@/ports";
import { makeLogger } from "@/shared/observability";

const logger = makeLogger({ component: "DrizzleJobQueueAdapter" });

export class DrizzleJobQueueAdapter implements JobQueuePort {
  constructor(private readonly db: Database) {}

  async enqueueJob(params: EnqueueJobParams): Promise<void> {
    const { taskId, payload, runAt, jobKey, queueName } = params;

    // Convert Date to ISO string for PostgreSQL timestamp compatibility
    const runAtIso = runAt.toISOString();

    logger.debug({ taskId, jobKey, runAt: runAtIso }, "Enqueuing job");

    // Build payload as JSON string for Graphile Worker
    const payloadJson = JSON.stringify(payload);

    if (queueName) {
      await this.db.execute(sql`
        SELECT graphile_worker.add_job(
          ${taskId},
          ${payloadJson}::jsonb,
          queue_name => ${queueName},
          run_at => ${runAtIso}::timestamptz,
          job_key => ${jobKey},
          job_key_mode => 'replace'
        )
      `);
    } else {
      await this.db.execute(sql`
        SELECT graphile_worker.add_job(
          ${taskId},
          ${payloadJson}::jsonb,
          run_at => ${runAtIso}::timestamptz,
          job_key => ${jobKey},
          job_key_mode => 'replace'
        )
      `);
    }

    logger.info({ taskId, jobKey }, "Job enqueued");
  }
}
