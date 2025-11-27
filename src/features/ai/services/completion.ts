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
): Promise<{ message: Message; requestId: string }> {
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

  const baseMetadata = {
    system: "ai_completion",
    provider: providerMeta.provider,
    llmRequestId: providerMeta.requestId,
    totalTokens,
  };

  // Branch based on whether provider cost is available
  // Branch based on whether provider cost is available

  try {
    if (typeof result.providerCostUsd === "number") {
      // Cost available - calculate markup and bill user
      const markupFactor = serverEnv().USER_PRICE_MARKUP_FACTOR;
      const providerCostCredits = usdToCredits(
        result.providerCostUsd,
        serverEnv().CREDITS_PER_USDC
      );
      const userPriceCredits = calculateUserPriceCredits(
        providerCostCredits,
        markupFactor
      );

      // Enforce profit margin invariant
      if (userPriceCredits < providerCostCredits) {
        console.error(
          `[CompletionService] Invariant violation: User price (${userPriceCredits}) < Provider cost (${providerCostCredits})`
        );
      }

      await accountService.recordLlmUsage({
        billingStatus: "billed",
        billingAccountId: caller.billingAccountId,
        virtualKeyId: caller.virtualKeyId,
        requestId,
        model: modelId,
        promptTokens: result.usage?.promptTokens ?? 0,
        completionTokens: result.usage?.completionTokens ?? 0,
        providerCostUsd: result.providerCostUsd,
        providerCostCredits,
        userPriceCredits,
        markupFactorApplied: markupFactor,
        metadata: baseMetadata,
      });
    } else {
      // No cost available - record usage but don't bill
      await accountService.recordLlmUsage({
        billingStatus: "needs_review",
        billingAccountId: caller.billingAccountId,
        virtualKeyId: caller.virtualKeyId,
        requestId,
        model: modelId,
        promptTokens: result.usage?.promptTokens ?? 0,
        completionTokens: result.usage?.completionTokens ?? 0,
        metadata: baseMetadata,
      });
    }
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
    // EXCEPT in test environment where we need to catch these issues
    if (serverEnv().APP_ENV === "test") {
      throw error;
    }
  }

  // Feature sets timestamp after completion using injected clock
  // Feature sets timestamp after completion using injected clock
  return {
    message: {
      ...result.message,
      timestamp: clock.now(),
    },
    requestId,
  };
}
