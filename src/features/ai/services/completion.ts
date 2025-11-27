// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/ai/services/completion`
 * Purpose: Use case orchestration for AI completion with dual-cost billing.
 * Scope: Coordinate core rules, port calls, set output timestamp, record usage. Does not handle authentication or rate limiting.
 * Invariants: Only imports core, ports, shared - never contracts or adapters; pre-call credit check enforced; post-call billing never blocks response
 * Side-effects: IO (via ports)
 * Notes: Logs warnings when cost is zero; post-call billing errors swallowed to preserve UX
 * Links: Called by API routes, uses core domain and ports
 * @public
 */

import { randomUUID } from "node:crypto";

import {
  assertMessageLength,
  calculateUserPriceCredits,
  filterSystemMessages,
  MAX_MESSAGE_CHARS,
  type Message,
  trimConversationHistory,
  usdToCredits,
} from "@/core";
import type { AccountService, Clock, LlmCaller, LlmService } from "@/ports";
import { InsufficientCreditsPortError } from "@/ports";
import { serverEnv } from "@/shared/env";

const DEFAULT_MAX_COMPLETION_TOKENS = 2048;
const CHARS_PER_TOKEN_ESTIMATE = 4;
// Conservative estimate for pre-flight check: $0.01 per 1k tokens (high-end model price)
const ESTIMATED_USD_PER_1K_TOKENS = 0.01;

function estimateTotalTokens(messages: Message[]): number {
  const totalChars = messages.reduce(
    (sum, message) => sum + message.content.length,
    0
  );
  const promptTokens = Math.ceil(totalChars / CHARS_PER_TOKEN_ESTIMATE);
  return promptTokens + DEFAULT_MAX_COMPLETION_TOKENS;
}

export async function execute(
  messages: Message[],
  llmService: LlmService,
  accountService: AccountService,
  clock: Clock,
  caller: LlmCaller
): Promise<Message> {
  // Apply core business rules first
  const userMessages = filterSystemMessages(messages);

  for (const message of userMessages) {
    assertMessageLength(message.content, MAX_MESSAGE_CHARS);
  }

  const trimmedMessages = trimConversationHistory(
    userMessages,
    MAX_MESSAGE_CHARS
  );

  // Preflight credit check
  const estimatedTotalTokens = estimateTotalTokens(trimmedMessages);
  const estimatedCostUsd =
    (estimatedTotalTokens / 1000) * ESTIMATED_USD_PER_1K_TOKENS;
  const estimatedUserPriceCredits = calculateUserPriceCredits(
    usdToCredits(estimatedCostUsd, serverEnv().CREDITS_PER_USDC),
    serverEnv().USER_PRICE_MARKUP_FACTOR
  );

  const currentBalance = await accountService.getBalance(
    caller.billingAccountId
  );

  // Convert bigint to number for comparison (safe for pre-flight check)
  if (currentBalance < Number(estimatedUserPriceCredits)) {
    throw new InsufficientCreditsPortError(
      caller.billingAccountId,
      Number(estimatedUserPriceCredits),
      currentBalance
    );
  }

  const requestId = randomUUID();

  // Delegate to port - caller constructed at auth boundary
  const result = await llmService.completion({
    messages: trimmedMessages,
    caller,
  });

  const totalTokens = result.usage?.totalTokens ?? 0;
  const providerMeta = (result.providerMeta ?? {}) as Record<string, unknown>;
  const modelId =
    typeof providerMeta.model === "string" ? providerMeta.model : "unknown";

  // Calculate actual costs
  // If providerCostUsd is missing (should be caught by adapter), default to 0 to avoid crash, but log error
  const providerCostUsd = result.providerCostUsd ?? 0;

  // Feature-level warning when cost is missing (correlates with adapter warning)
  if (providerCostUsd === 0) {
    console.warn(
      "[CompletionService] Zero provider cost - user not charged",
      JSON.stringify({
        requestId,
        billingAccountId: caller.billingAccountId,
        modelId,
        promptTokens: result.usage?.promptTokens ?? 0,
        completionTokens: result.usage?.completionTokens ?? 0,
      })
    );
  }

  const markupFactor = serverEnv().USER_PRICE_MARKUP_FACTOR;
  // 5. Calculate costs (Credits-Centric)
  const providerCostCredits = usdToCredits(
    providerCostUsd,
    serverEnv().CREDITS_PER_USDC
  );
  const userPriceCredits = calculateUserPriceCredits(
    providerCostCredits,
    markupFactor
  );

  // Enforce profit margin invariant
  if (userPriceCredits < providerCostCredits) {
    // This should be impossible due to calculateUserPriceCredits logic,
    // but we assert it here for safety.
    console.error(
      `[CompletionService] Invariant violation: User price (${userPriceCredits}) < Provider cost (${providerCostCredits})`
    );
    // We still proceed, but maybe we should throw?
    // For now, the pricing helper guarantees this, so it's a sanity check.
  }

  try {
    await accountService.recordLlmUsage({
      billingAccountId: caller.billingAccountId,
      virtualKeyId: caller.virtualKeyId,
      requestId,
      model: modelId,
      promptTokens: result.usage?.promptTokens ?? 0,
      completionTokens: result.usage?.completionTokens ?? 0,
      providerCostUsd, // Store for audit
      providerCostCredits,
      userPriceCredits,
      markupFactorApplied: markupFactor,
      metadata: {
        system: "ai_completion", // New metadata field
        provider: providerMeta.provider,
        llmRequestId: providerMeta.requestId,
        totalTokens,
      },
    });
  } catch (error) {
    // Post-call billing is best-effort - NEVER block user response after LLM succeeded
    if (error instanceof InsufficientCreditsPortError) {
      // Pre-flight passed but post-call failed - race condition or concurrent usage
      console.warn(
        "[CompletionService] Post-call insufficient credits (user got response for free)",
        JSON.stringify({
          requestId,
          billingAccountId: caller.billingAccountId,
          required: error.cost,
          available: error.previousBalance,
        })
      );
    } else {
      // Other errors (DB down, FK constraint, etc.) are operational issues
      console.error(
        "[CompletionService] CRITICAL: Post-call billing failed - user response NOT blocked",
        JSON.stringify({
          requestId,
          billingAccountId: caller.billingAccountId,
          error: error instanceof Error ? error.message : String(error),
        })
      );
    }
    // DO NOT RETHROW - user already got LLM response, must see it
  }

  // Feature sets timestamp after completion using injected clock
  return {
    ...result.message,
    timestamp: clock.now(),
  };
}
