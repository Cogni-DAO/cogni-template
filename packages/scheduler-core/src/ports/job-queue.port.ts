// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@ports/job-queue`
 * Purpose: Job queue port for background job enqueuing.
 * Scope: Defines generic contract for enqueuing jobs. Does not contain implementations or SQL.
 * Invariants:
 * - jobKey provides idempotency (same key = same job, no duplicates)
 * - queueName serializes execution (one job per queue at a time)
 * - add_job SQL isolated to single adapter implementation
 * Side-effects: none (interface definition only)
 * Links: docs/SCHEDULER_SPEC.md, DrizzleJobQueueAdapter
 * @public
 */

/**
 * Parameters for enqueuing a job.
 */
export interface EnqueueJobParams {
  /** Task identifier (e.g., 'execute_scheduled_run', 'reconcile_schedules') */
  taskId: string;
  /** JSON-serializable payload for the task */
  payload: Record<string, unknown>;
  /** When to run the job */
  runAt: Date;
  /** Idempotency key - same key prevents duplicate jobs */
  jobKey: string;
  /** Optional queue name for serialization (one job per queue at a time) */
  queueName?: string;
}

/**
 * Job queue port for background job enqueuing.
 * Isolates add_job SQL to prevent sprawl across adapters.
 */
export interface JobQueuePort {
  /**
   * Enqueues a job for background execution.
   * Uses jobKey for idempotency (replace mode).
   * Uses queueName for serialization when provided.
   */
  enqueueJob(params: EnqueueJobParams): Promise<void>;
}
