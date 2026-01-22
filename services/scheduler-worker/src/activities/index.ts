// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/scheduler-worker-service/activities`
 * Purpose: Temporal Activities for scheduled graph execution.
 * Scope: Plain async functions that perform I/O (DB, HTTP). Called by Workflow.
 * Invariants:
 *   - Per ACTIVITY_IDEMPOTENCY: All activities must be idempotent or rely on downstream idempotency
 *   - Per EXECUTION_VIA_SERVICE_API: executeGraphActivity calls internal API, never imports graph code
 *   - Per GRANT_VALIDATED_TWICE: Worker validates grant before calling API (fail-fast)
 *   - SCHEDULER_API_TOKEN treated as secret (never logged)
 * Side-effects: IO (database, HTTP to internal API)
 * Links: docs/SCHEDULER_SPEC.md, docs/TEMPORAL_PATTERNS.md
 * @internal
 */

import type {
  createDbClient,
  DrizzleExecutionGrantAdapter,
  DrizzleScheduleRunAdapter,
} from "@cogni/db-client";
import type { Logger } from "pino";

/**
 * Dependencies injected into activities at worker creation.
 * Activities are created as closures over these deps.
 */
export interface ActivityDeps {
  db: ReturnType<typeof createDbClient>;
  grantAdapter: DrizzleExecutionGrantAdapter;
  runAdapter: DrizzleScheduleRunAdapter;
  config: {
    appBaseUrl: string;
    schedulerApiToken: string;
  };
  logger: Logger;
}

/**
 * Input for validateGrantActivity.
 */
export interface ValidateGrantInput {
  grantId: string;
  graphId: string;
}

/**
 * Input for createScheduleRunActivity.
 */
export interface CreateScheduleRunInput {
  scheduleId: string;
  runId: string;
  scheduledFor: string; // ISO string
}

/**
 * Input for executeGraphActivity.
 */
export interface ExecuteGraphInput {
  scheduleId: string;
  graphId: string;
  executionGrantId: string;
  input: Record<string, unknown>;
  scheduledFor: string; // ISO string - used for idempotency key
}

/**
 * Output from executeGraphActivity.
 */
export interface ExecuteGraphOutput {
  ok: boolean;
  runId: string;
  traceId: string | null;
  errorCode?: string;
}

/**
 * Input for updateScheduleRunActivity.
 */
export interface UpdateScheduleRunInput {
  runId: string;
  status: "running" | "success" | "error" | "skipped";
  traceId?: string | null;
  errorMessage?: string;
}

/**
 * Creates activity functions with injected dependencies.
 * Per Temporal patterns: activities are plain async functions.
 */
export function createActivities(deps: ActivityDeps) {
  const { grantAdapter, runAdapter, config, logger } = deps;

  /**
   * Validates grant before execution (fail-fast).
   * Per GRANT_VALIDATED_TWICE: Defense-in-depth, API re-validates.
   * @throws Error if grant invalid/expired/revoked/scope mismatch
   */
  async function validateGrantActivity(
    input: ValidateGrantInput
  ): Promise<void> {
    const { grantId, graphId } = input;
    logger.info({ grantId, graphId }, "Validating grant for graph");

    // This throws on validation failure
    await grantAdapter.validateGrantForGraph(grantId, graphId);

    logger.info({ grantId, graphId }, "Grant validated successfully");
  }

  /**
   * Creates schedule_runs record (ledger entry).
   * Per RUN_LEDGER_FOR_GOVERNANCE: Every execution creates a run record.
   * Idempotent via UNIQUE(schedule_id, scheduled_for) constraint.
   */
  async function createScheduleRunActivity(
    input: CreateScheduleRunInput
  ): Promise<void> {
    const { scheduleId, runId, scheduledFor } = input;
    logger.info({ scheduleId, runId, scheduledFor }, "Creating schedule run");

    await runAdapter.createRun({
      scheduleId,
      runId,
      scheduledFor: new Date(scheduledFor),
    });

    logger.info({ runId }, "Schedule run created");
  }

  /**
   * Calls internal API to execute graph.
   * Per EXECUTION_VIA_SERVICE_API: Worker NEVER imports graph execution code.
   * Per SLOT_IDEMPOTENCY_VIA_EXECUTION_REQUESTS: Uses scheduleId:scheduledFor as idempotency key.
   */
  async function executeGraphActivity(
    input: ExecuteGraphInput
  ): Promise<ExecuteGraphOutput> {
    const {
      scheduleId,
      graphId,
      executionGrantId,
      input: graphInput,
      scheduledFor,
    } = input;

    // Per SLOT_IDEMPOTENCY_VIA_EXECUTION_REQUESTS
    const idempotencyKey = `${scheduleId}:${scheduledFor}`;

    const url = `${config.appBaseUrl}/api/internal/graphs/${graphId}/runs`;

    logger.info(
      { scheduleId, graphId, idempotencyKey },
      "Calling internal graph execution API"
    );

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.schedulerApiToken}`,
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        executionGrantId,
        input: graphInput,
      }),
    });

    if (!response.ok) {
      // Handle HTTP errors (401, 403, 404, 422)
      const errorText = await response.text();
      logger.error(
        { status: response.status, scheduleId, graphId },
        "Internal API returned error"
      );
      throw new Error(`Internal API error: ${response.status} - ${errorText}`);
    }

    const result = (await response.json()) as ExecuteGraphOutput;

    if (result.ok) {
      logger.info(
        { scheduleId, graphId, runId: result.runId },
        "Graph execution completed successfully"
      );
    } else {
      logger.warn(
        {
          scheduleId,
          graphId,
          runId: result.runId,
          errorCode: result.errorCode,
        },
        "Graph execution completed with error"
      );
    }

    return result;
  }

  /**
   * Updates schedule_runs record status.
   * Per ACTIVITY_IDEMPOTENCY: Uses monotonic status updates (pending->running->success/error).
   */
  async function updateScheduleRunActivity(
    input: UpdateScheduleRunInput
  ): Promise<void> {
    const { runId, status, traceId, errorMessage } = input;
    logger.info({ runId, status }, "Updating schedule run status");

    if (status === "running") {
      await runAdapter.markRunStarted(runId, traceId ?? undefined);
    } else {
      await runAdapter.markRunCompleted(runId, status, errorMessage);
    }

    logger.info({ runId, status }, "Schedule run status updated");
  }

  return {
    validateGrantActivity,
    createScheduleRunActivity,
    executeGraphActivity,
    updateScheduleRunActivity,
  };
}

// Export types for workflow to use
export type Activities = ReturnType<typeof createActivities>;
