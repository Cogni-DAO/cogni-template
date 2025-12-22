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

    await accountService.recordChargeReceipt({
      billingAccountId,
      virtualKeyId,
      requestId,
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
