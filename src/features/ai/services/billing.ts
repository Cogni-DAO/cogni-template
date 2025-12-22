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
import type { UsageFact } from "@/types/usage";
import { calculateDefaultLlmCharge } from "./llmPricingPolicy";

/**
 * Context for billing a completed LLM call.
 */
export interface BillingContext {
  readonly billingAccountId: string;
  readonly virtualKeyId: string;
  readonly requestId: string;
  readonly model: string;
  readonly providerCostUsd: number | undefined;
  readonly litellmCallId: string | undefined;
  readonly provenance: "response" | "stream";
}

/**
 * Record charge receipt for a completed LLM call.
 *
 * Non-blocking in production (catches all errors).
 * Re-throws in test environment for visibility.
 *
 * Invariants:
 * - ZERO_CREDIT_RECEIPTS_WRITTEN: Always records receipt even when chargedCredits = 0n
 * - LITELLM_CALL_ID_FALLBACK: sourceReference = litellmCallId ?? requestId with error log
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
    requestId,
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
          requestId,
          providerCostUsd,
          userCostUsd,
          chargedCredits: chargedCredits.toString(),
        },
        "Cost calculation complete"
      );
    } else if (!isFree && typeof providerCostUsd !== "number") {
      // CRITICAL: Non-free model but no cost data (degraded billing)
      log.error(
        {
          requestId,
          model,
          litellmCallId,
          isFree,
        },
        "CRITICAL: LiteLLM response missing cost data - billing incomplete (degraded under-billing mode)"
      );
    }
    // If no cost available or free model: chargedCredits stays 0n

    // INVARIANT: Always record charge receipt for billed calls
    // sourceReference: litellmCallId (happy path) or requestId (forensic fallback)
    const sourceReference = litellmCallId ?? requestId;
    if (!litellmCallId) {
      log.error(
        { requestId, model, isFree },
        "BUG: LiteLLM response missing call ID - recording charge_receipt without joinable usage reference"
      );
    }

    // P0: Direct LLM call = single-node graph; ingressRequestId coincidentally equals runId
    // P1: runId persists across reconnects; many ingressRequestIds per runId
    await accountService.recordChargeReceipt({
      billingAccountId,
      virtualKeyId,
      runId: requestId, // P0: requestId serves as runId for direct LLM calls
      attempt: 0, // P0: always 0
      ingressRequestId: requestId, // Optional delivery correlation
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
      {
        err: error,
        requestId,
        billingAccountId,
      },
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
 *
 * @param fact - Usage fact from usage_report event
 * @param callIndex - Billing-subscriber-assigned index for fallback usageUnitId
 * @param accountService - Account service port for charge recording
 * @param log - Logger for error reporting
 */
export async function commitUsageFact(
  fact: UsageFact,
  callIndex: number,
  accountService: AccountService,
  log: Logger
): Promise<void> {
  const {
    runId,
    attempt,
    billingAccountId,
    virtualKeyId,
    ingressRequestId,
    source,
  } = fact;

  // Resolve usageUnitId: adapter-provided or fallback
  let usageUnitId = fact.usageUnitId;
  if (!usageUnitId) {
    log.error(
      { runId, model: fact.model, callIndex },
      "billing.missing_usage_unit_id"
    );
    usageUnitId = `MISSING:${runId}/${callIndex}`;
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

    log.info(
      {
        runId,
        attempt,
        usageUnitId,
        sourceReference,
        chargedCredits: chargedCredits.toString(),
      },
      "commitUsageFact: charge recorded"
    );
  } catch (error) {
    // Post-call billing is best-effort - NEVER block user response
    log.error(
      { err: error, runId, ingressRequestId, billingAccountId },
      "CRITICAL: commitUsageFact failed - user response NOT blocked"
    );
    // Re-throw in test environment for visibility
    if (serverEnv().APP_ENV === "test") {
      throw error;
    }
  }
}
