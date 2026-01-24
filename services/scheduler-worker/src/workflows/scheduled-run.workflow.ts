// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/scheduler-worker-service/workflows/scheduled-run`
 * Purpose: Temporal Workflow for scheduled graph execution.
 * Scope: Deterministic orchestration only. All I/O happens in Activities.
 * Invariants:
 *   - Per TEMPORAL_DETERMINISM: No I/O, network calls, or LLM invocations in workflow code
 *   - Per WORKER_NEVER_CONTROLS_SCHEDULES: Does NOT create/modify/delete schedules
 *   - Per SCHEDULED_TIMESTAMP_FROM_TEMPORAL: scheduledFor comes from workflow input (set by Schedule)
 * Side-effects: none (deterministic orchestration only)
 * Links: docs/SCHEDULER_SPEC.md, docs/TEMPORAL_PATTERNS.md
 * @internal
 */

import {
  ApplicationFailure,
  proxyActivities,
  uuid4,
  workflowInfo,
} from "@temporalio/workflow";

import type { Activities } from "../activities/index.js";

// Proxy short activities with 1 minute timeout
const {
  validateGrantActivity,
  createScheduleRunActivity,
  updateScheduleRunActivity,
} = proxyActivities<Activities>({
  startToCloseTimeout: "1 minute",
  retry: {
    initialInterval: "1 second",
    maximumInterval: "30 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 3,
  },
});

// Proxy executeGraphActivity with longer timeout for LLM execution
// LLM calls can take 30-120+ seconds depending on model and input size
const { executeGraphActivity } = proxyActivities<Activities>({
  startToCloseTimeout: "5 minutes",
  retry: {
    initialInterval: "1 second",
    maximumInterval: "30 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 3,
  },
});

/**
 * Input for GovernanceScheduledRunWorkflow.
 * Per SCHEDULED_TIMESTAMP_FROM_TEMPORAL: scheduledFor derived from search attribute, not input.
 */
export interface ScheduledRunWorkflowInput {
  /** Schedule ID (DB UUID, also Temporal scheduleId) */
  scheduleId: string;
  /** Graph ID to execute */
  graphId: string;
  /** Execution grant ID for authorization */
  executionGrantId: string;
  /** Graph input payload */
  input: Record<string, unknown>;
}

/**
 * GovernanceScheduledRunWorkflow - Orchestrates scheduled graph execution.
 *
 * Per SCHEDULER_SPEC.md execution flow:
 * 1. Validate grant (fail-fast)
 * 2. Create schedule_runs record (ledger entry)
 * 3. Mark run as started
 * 4. Execute graph via internal API
 * 5. Mark run as success/error
 *
 * Per TEMPORAL_PATTERNS.md: This workflow is deterministic.
 * All I/O happens in Activities.
 */
export async function GovernanceScheduledRunWorkflow(
  input: ScheduledRunWorkflowInput
): Promise<void> {
  const { scheduleId, graphId, executionGrantId, input: graphInput } = input;

  // Per SCHEDULED_TIMESTAMP_FROM_TEMPORAL: Get scheduledFor from Temporal search attribute
  // When workflow is started by a Schedule, TemporalScheduledStartTime is automatically set
  const info = workflowInfo();
  const scheduledStartTime = info.searchAttributes
    ?.TemporalScheduledStartTime as Date[] | undefined;
  if (!scheduledStartTime?.[0]) {
    throw ApplicationFailure.nonRetryable(
      `TemporalScheduledStartTime search attribute missing - workflow must be started by Schedule. ` +
        `scheduleId=${scheduleId}, workflowId=${info.workflowId}, runId=${info.runId}`
    );
  }
  const scheduledFor = scheduledStartTime[0].toISOString();

  // Generate run ID (deterministic via Temporal's uuid4)
  const runId = uuid4();

  // 1. Validate grant (fail-fast)
  // Throws if grant invalid/expired/revoked/scope mismatch
  try {
    await validateGrantActivity({ grantId: executionGrantId, graphId });
  } catch {
    // Grant validation failed - create run record as skipped
    await createScheduleRunActivity({ scheduleId, runId, scheduledFor });
    await updateScheduleRunActivity({
      runId,
      status: "skipped",
      errorMessage: "Grant validation failed",
    });
    return;
  }

  // 2. Create schedule_runs record (RUN_LEDGER_FOR_GOVERNANCE)
  await createScheduleRunActivity({ scheduleId, runId, scheduledFor });

  // 3. Mark run as started
  await updateScheduleRunActivity({ runId, status: "running" });

  // 4. Execute graph via internal API
  // Pass canonical runId to internal API for correlation with schedule_runs
  try {
    const result = await executeGraphActivity({
      scheduleId,
      graphId,
      executionGrantId,
      input: graphInput,
      scheduledFor,
      runId,
    });

    // 5. Mark run as success/error based on result
    if (result.ok) {
      await updateScheduleRunActivity({
        runId,
        status: "success",
        traceId: result.traceId,
      });
    } else {
      await updateScheduleRunActivity({
        runId,
        status: "error",
        traceId: result.traceId,
        errorMessage: result.errorCode ?? "Graph execution failed",
      });
    }
  } catch (error) {
    // Activity threw - mark as error
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error during execution";
    await updateScheduleRunActivity({
      runId,
      status: "error",
      errorMessage,
    });
    throw error; // Re-throw so Temporal marks workflow as failed
  }
}
