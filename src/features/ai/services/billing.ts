// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/ai/services/billing`
 * Purpose: Post-call charge recording (non-blocking) and run-centric billing via commitUsageFact.
 * Scope: Calculate user charge from provider cost, record charge receipt. Does NOT perform pre-flight checks or LLM calls.
 * Invariants:
 *   - ONE_LEDGER_WRITER: Only this module calls accountService.recordChargeReceipt()
 *   - Post-call billing NEVER blocks user response (catches errors in prod)
 *   - ZERO_CREDIT_RECEIPTS_WRITTEN: Always records receipt even when chargedCredits = 0n
 *   - IDEMPOTENT_CHARGES: source_reference = runId/attempt/usageUnitId; DB constraint prevents duplicates
 *   - TEST_ENV_RETHROWS_BILLING: APP_ENV === "test" re-throws for test visibility
 * Side-effects: IO (writes charge receipt via AccountService)
 * Notes: Per GRAPH_EXECUTION.md, COMPLETION_REFACTOR_PLAN.md P2 extraction
 * Links: completion.ts, ports/account.port.ts, llmPricingPolicy.ts, GRAPH_EXECUTION.md
 * @public
 */

import type { Logger } from "pino";
import type { AccountService } from "@/ports";
import { isModelFree } from "@/shared/ai/model-catalog.server";
import { serverEnv } from "@/shared/env";
import { EVENT_NAMES } from "@/shared/observability";
import type { AiBillingCommitCompleteEvent } from "@/shared/observability/events/ai";
import type { RunContext } from "@/types/run-context";
import type { UsageFact } from "@/types/usage";
import { calculateDefaultLlmCharge } from "./llmPricingPolicy";

/**
 * Context for billing a completed LLM call.
 * Run semantics (runId, attempt) are set by caller (completion.ts), not by billing.
 */
export interface BillingContext {
  readonly billingAccountId: string;
  readonly virtualKeyId: string;
  /** Canonical execution identity (set by caller) */
  readonly runId: string;
  /** Retry attempt number (set by caller; P0: always 0) */
  readonly attempt: number;
  /** Ingress request correlation (set by caller; P0: equals runId) */
  readonly ingressRequestId?: string;
  readonly model: string;
  readonly providerCostUsd: number | undefined;
  readonly litellmCallId: string | undefined;
  readonly provenance: "response" | "stream";
}

/**
 * Record charge receipt for a completed LLM call.
 *
 * TODO(P0): DIRECT-CALL-ONLY. This function is for non-graph direct LLM calls.
 * Graph execution will use usage_report events -> commitUsageFact() instead.
 * Remove this function when graphs are implemented (see GRAPH_EXECUTION.md P0 checklist).
 *
 * Non-blocking in production (catches all errors).
 * Re-throws in test environment for visibility.
 *
 * Invariants:
 * - ZERO_CREDIT_RECEIPTS_WRITTEN: Always records receipt even when chargedCredits = 0n
 * - TEST_ENV_RETHROWS_BILLING: APP_ENV === "test" re-throws for test visibility
 *
 * @param context - Billing context from LLM result
 * @param accountService - Account service port for charge recording
 * @param log - Logger for error reporting
 */
export async function recordBilling(
  context: BillingContext,
  accountService: AccountService,
  log: Logger
): Promise<void> {
  const {
    billingAccountId,
    virtualKeyId,
    runId,
    attempt,
    ingressRequestId,
    model,
    providerCostUsd,
    litellmCallId,
    provenance,
  } = context;

  try {
    const isFree = await isModelFree(model);
    let chargedCredits = 0n;
    let userCostUsd: number | null = null;

    if (!isFree && typeof providerCostUsd === "number") {
      // Use policy function for consistent calculation
      const charge = calculateDefaultLlmCharge(providerCostUsd);
      chargedCredits = charge.chargedCredits;
      userCostUsd = charge.userCostUsd;

      log.debug(
        {
          runId,
          providerCostUsd,
          userCostUsd,
          chargedCredits: chargedCredits.toString(),
        },
        "Cost calculation complete"
      );
    } else if (!isFree && typeof providerCostUsd !== "number") {
      // CRITICAL: Non-free model but no cost data (degraded billing)
      log.error(
        { runId, model, litellmCallId, isFree },
        "CRITICAL: LiteLLM response missing cost data - billing incomplete (degraded under-billing mode)"
      );
    }
    // If no cost available or free model: chargedCredits stays 0n

    // usageUnitId: litellmCallId (happy path) or deterministic fallback
    const usageUnitId = litellmCallId ?? `MISSING:${runId}/0`;
    if (!litellmCallId) {
      log.error(
        { runId, model, isFree },
        "BUG: LiteLLM response missing call ID - using fallback usageUnitId"
      );
    }

    const sourceReference = computeIdempotencyKey(runId, attempt, usageUnitId);

    await accountService.recordChargeReceipt({
      billingAccountId,
      virtualKeyId,
      runId,
      attempt,
      ...(ingressRequestId && { ingressRequestId }),
      chargedCredits,
      responseCostUsd: userCostUsd,
      litellmCallId: litellmCallId ?? null,
      provenance,
      chargeReason: "llm_usage",
      sourceSystem: "litellm",
      sourceReference,
    });
  } catch (error) {
    // Post-call billing is best-effort - NEVER block user response
    // recordChargeReceipt should never throw InsufficientCreditsPortError per design
    log.error(
      { err: error, runId, billingAccountId },
      `CRITICAL: Post-call billing failed (${provenance}) - user response NOT blocked`
    );
    // DO NOT RETHROW - user already got LLM response, must see it
    // EXCEPT in test environment where we need to catch these issues
    if (serverEnv().APP_ENV === "test") {
      throw error;
    }
  }
}

// ============================================================================
// Run-Centric Billing (GRAPH_EXECUTION.md P0)
// ============================================================================

/**
 * Compute idempotency key for run-centric billing.
 * Per GRAPH_EXECUTION.md: source_reference = runId/attempt/usageUnitId
 *
 * @param runId - Graph run ID
 * @param attempt - Attempt number (P0: always 0)
 * @param usageUnitId - Adapter-provided stable ID for this usage unit
 * @returns Idempotency key for source_reference column
 */
export function computeIdempotencyKey(
  runId: string,
  attempt: number,
  usageUnitId: string
): string {
  return `${runId}/${attempt}/${usageUnitId}`;
}

/**
 * Commit a usage fact to the billing ledger.
 * Per GRAPH_EXECUTION.md: billing subscriber calls this for each usage_report event.
 *
 * Invariants:
 * - ONE_LEDGER_WRITER: Only this module calls accountService.recordChargeReceipt()
 * - IDEMPOTENT_CHARGES: DB constraint on (source_system, source_reference) prevents duplicates
 * - Billing subscriber owns callIndex for deterministic fallback
 * - RELAY_PROVIDES_CONTEXT: ingressRequestId comes from context, not from fact
 *
 * @param fact - Usage fact from usage_report event (executor-agnostic)
 * @param callIndex - Billing-subscriber-assigned index for fallback usageUnitId
 * @param context - Run context from relay (provides ingressRequestId for correlation)
 * @param accountService - Account service port for charge recording
 * @param log - Logger for error reporting
 */
export async function commitUsageFact(
  fact: UsageFact,
  context: RunContext,
  accountService: AccountService,
  log: Logger
): Promise<void> {
  const {
    runId,
    attempt,
    billingAccountId,
    virtualKeyId,
    source,
    usageUnitId,
  } = fact;
  const { ingressRequestId } = context;

  // External executors (validated with hints schema) may have undefined usageUnitId.
  // Billing-authoritative executors (strict schema) always have usageUnitId (validation ensures it).
  if (!usageUnitId) {
    // Skip billing for external executor hints without usageUnitId (telemetry-only, not authoritative)
    log.warn(
      { runId, executorType: fact.executorType },
      "Skipping billing commit: usageUnitId missing (external executor hint)"
    );
    return;
  }

  try {
    // Determine model and cost
    const model = fact.model ?? "unknown";
    const isFree = await isModelFree(model);
    let chargedCredits = 0n;
    let userCostUsd: number | null = null;

    if (!isFree && typeof fact.costUsd === "number") {
      const charge = calculateDefaultLlmCharge(fact.costUsd);
      chargedCredits = charge.chargedCredits;
      userCostUsd = charge.userCostUsd;

      log.debug(
        {
          runId,
          ingressRequestId,
          providerCostUsd: fact.costUsd,
          userCostUsd,
          chargedCredits: chargedCredits.toString(),
        },
        "commitUsageFact: cost calculation complete"
      );
    } else if (!isFree && typeof fact.costUsd !== "number") {
      log.error(
        { runId, ingressRequestId, model, usageUnitId },
        "CRITICAL: UsageFact missing cost data - billing incomplete (degraded under-billing mode)"
      );
    }

    // Compute idempotency key
    const sourceReference = computeIdempotencyKey(runId, attempt, usageUnitId);

    // Record charge receipt (sole ledger writer)
    await accountService.recordChargeReceipt({
      billingAccountId,
      virtualKeyId,
      runId,
      attempt,
      ...(ingressRequestId && { ingressRequestId }), // Optional delivery correlation
      chargedCredits,
      responseCostUsd: userCostUsd,
      litellmCallId: fact.usageUnitId ?? null, // Original adapter ID for correlation
      provenance: "stream", // Graph execution always streams
      chargeReason: "llm_usage",
      sourceSystem: source,
      sourceReference,
    });

    // Log billing commit complete (success path)
    const successEvent: AiBillingCommitCompleteEvent = {
      event: EVENT_NAMES.AI_BILLING_COMMIT_COMPLETE,
      reqId: ingressRequestId,
      runId,
      attempt,
      outcome: "success",
      chargedCredits: chargedCredits.toString(),
      sourceSystem: source,
    };
    log.info(successEvent);
  } catch (error) {
    // Post-call billing is best-effort - NEVER block user response
    // Log billing commit complete (error path) with errorCode
    const errorCode =
      error instanceof Error && error.message.includes("duplicate")
        ? "db_error"
        : "unknown";
    const errorEvent: AiBillingCommitCompleteEvent = {
      event: EVENT_NAMES.AI_BILLING_COMMIT_COMPLETE,
      reqId: ingressRequestId,
      runId,
      attempt,
      outcome: "error",
      errorCode,
      sourceSystem: source,
    };
    log.error({ ...errorEvent, err: error });
    // Re-throw in test environment for visibility
    if (serverEnv().APP_ENV === "test") {
      throw error;
    }
  }
}
