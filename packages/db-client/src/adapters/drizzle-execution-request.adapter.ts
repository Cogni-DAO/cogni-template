// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/scheduling/drizzle-execution-request`
 * Purpose: DrizzleExecutionRequestAdapter for execution request idempotency.
 * Scope: Implements ExecutionRequestPort with Drizzle ORM. Does not contain scheduling logic.
 * Invariants:
 *   - Per EXECUTION_IDEMPOTENCY_PERSISTED: Persists idempotency key → {ok, runId, traceId, errorCode}
 *   - Stores BOTH success and error outcomes - retries return cached outcome
 *   - idempotencyKey uniqueness enforced at DB level (primary key)
 *   - requestHash mismatch detection returns 'mismatch' status
 * Side-effects: IO (database operations)
 * Links: ports/scheduling/execution-request.port.ts, docs/SCHEDULER_SPEC.md
 * @public
 */

import { isAiExecutionErrorCode } from "@cogni/ai-core";
import { executionRequests } from "@cogni/db-schema/scheduling";
import type {
  ExecutionOutcome,
  ExecutionRequest,
  ExecutionRequestPort,
  IdempotencyCheckResult,
} from "@cogni/scheduler-core";
import { eq } from "drizzle-orm";
import type { Database, LoggerLike } from "../client";

export class DrizzleExecutionRequestAdapter implements ExecutionRequestPort {
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

  async checkIdempotency(
    idempotencyKey: string,
    requestHash: string
  ): Promise<IdempotencyCheckResult> {
    const existing = await this.db
      .select()
      .from(executionRequests)
      .where(eq(executionRequests.idempotencyKey, idempotencyKey))
      .limit(1);

    const record = existing[0];
    if (!record) {
      this.logger.debug(
        { idempotencyKey },
        "Idempotency key not found, new request"
      );
      return { status: "new" };
    }

    // Check if request hash matches
    if (record.requestHash !== requestHash) {
      this.logger.warn(
        {
          idempotencyKey,
          existingHash: record.requestHash,
          providedHash: requestHash,
        },
        "Idempotency key exists but request hash differs"
      );
      return {
        status: "mismatch",
        existingHash: record.requestHash,
        providedHash: requestHash,
      };
    }

    // Hash matches - return cached result with outcome
    this.logger.info(
      { idempotencyKey, runId: record.runId, ok: record.ok },
      "Idempotency key hit, returning cached result"
    );
    return {
      status: "cached",
      request: this.toExecutionRequest(record),
    };
  }

  async storeRequest(
    idempotencyKey: string,
    requestHash: string,
    runId: string,
    traceId: string | null,
    outcome: ExecutionOutcome
  ): Promise<void> {
    await this.db.insert(executionRequests).values({
      idempotencyKey,
      requestHash,
      runId,
      traceId,
      ok: outcome.ok,
      errorCode: outcome.errorCode,
    });

    this.logger.info(
      { idempotencyKey, runId, ok: outcome.ok, errorCode: outcome.errorCode },
      "Stored execution request for idempotency"
    );
  }

  private toExecutionRequest(
    row: typeof executionRequests.$inferSelect
  ): ExecutionRequest {
    // Validate errorCode is a known AiExecutionErrorCode (or null)
    const errorCode =
      row.errorCode && isAiExecutionErrorCode(row.errorCode)
        ? row.errorCode
        : null;

    return {
      idempotencyKey: row.idempotencyKey,
      requestHash: row.requestHash,
      runId: row.runId,
      traceId: row.traceId,
      ok: row.ok,
      errorCode,
      createdAt: row.createdAt,
    };
  }
}
