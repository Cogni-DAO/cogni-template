// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@ports/execution-request`
 * Purpose: Port interface for execution request idempotency.
 * Scope: Defines contract for idempotent graph execution via internal API. Does not contain implementations.
 * Invariants:
 *   - Per EXECUTION_IDEMPOTENCY_PERSISTED: Persists idempotency key → {ok, runId, traceId, errorCode}
 *   - Stores BOTH success and error outcomes - retries return cached outcome
 *   - idempotencyKey uniqueness enforced at DB level (primary key)
 *   - requestHash mismatch detection for payload integrity
 * Side-effects: none (interface definition only)
 * Links: docs/SCHEDULER_SPEC.md, execution_requests table
 * @public
 */

import type { AiExecutionErrorCode } from "@cogni/ai-core";

/**
 * Stored execution request record.
 * Per SCHEDULER_SPEC.md: correctness layer for slot deduplication.
 * Stores both success and error outcomes for replay.
 */
export interface ExecutionRequest {
  /** Idempotency key (e.g., `scheduleId:TemporalScheduledStartTime`) */
  readonly idempotencyKey: string;
  /** SHA256 hash of normalized request payload */
  readonly requestHash: string;
  /** GraphExecutorPort runId */
  readonly runId: string;
  /** Langfuse trace ID (null if Langfuse not configured) */
  readonly traceId: string | null;
  /** Execution outcome: true = success, false = error */
  readonly ok: boolean;
  /** AiExecutionErrorCode if ok=false, null if ok=true */
  readonly errorCode: AiExecutionErrorCode | null;
  /** When request was first received */
  readonly createdAt: Date;
}

/**
 * Result of checking idempotency.
 */
export type IdempotencyCheckResult =
  | { status: "new" }
  | { status: "cached"; request: ExecutionRequest }
  | { status: "mismatch"; existingHash: string; providedHash: string };

/**
 * Outcome of graph execution to be persisted.
 */
export interface ExecutionOutcome {
  /** Execution succeeded */
  readonly ok: boolean;
  /** AiExecutionErrorCode if ok=false */
  readonly errorCode: AiExecutionErrorCode | null;
}

/**
 * Port interface for execution request idempotency.
 * Per EXECUTION_IDEMPOTENCY_PERSISTED: This is the correctness layer for slot deduplication.
 * Stores BOTH success and error outcomes - retries return the cached outcome.
 */
export interface ExecutionRequestPort {
  /**
   * Check if an execution request already exists.
   *
   * - If idempotencyKey doesn't exist: returns { status: 'new' }, caller proceeds with execution
   * - If idempotencyKey exists and requestHash matches: returns { status: 'cached', request }
   * - If idempotencyKey exists but requestHash differs: returns { status: 'mismatch' }
   *
   * @param idempotencyKey - Unique key for deduplication (e.g., `scheduleId:scheduledFor`)
   * @param requestHash - SHA256 hash of normalized request payload
   */
  checkIdempotency(
    idempotencyKey: string,
    requestHash: string
  ): Promise<IdempotencyCheckResult>;

  /**
   * Store execution request after graph execution completes.
   * Called after execution with BOTH success and error outcomes.
   * Retries will return the cached outcome.
   *
   * @param idempotencyKey - Unique key for deduplication
   * @param requestHash - SHA256 hash of normalized request payload
   * @param runId - GraphExecutorPort runId
   * @param traceId - Langfuse trace ID (null if not configured)
   * @param outcome - Execution result (ok + errorCode)
   */
  storeRequest(
    idempotencyKey: string,
    requestHash: string,
    runId: string,
    traceId: string | null,
    outcome: ExecutionOutcome
  ): Promise<void>;
}
