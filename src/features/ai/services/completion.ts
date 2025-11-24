// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/ai/services/completion`
 * Purpose: Use case orchestration for AI completion.
 * Scope: Coordinate core rules, port calls, set output timestamp. Does not handle authentication, rate limiting, or credit deduction.
 * Invariants: Only imports core, ports, shared - never contracts or adapters
 * Side-effects: IO (via ports)
 * Notes: Applies business rules then delegates to LLM service; accepts AccountService for future credit operations
 * Links: Called by API routes, uses core domain and ports
 * @public
 */

import { randomUUID } from "node:crypto";

import {
  assertMessageLength,
  calculateCost,
  filterSystemMessages,
  MAX_MESSAGE_CHARS,
  type Message,
  trimConversationHistory,
} from "@/core";
import type { AccountService, Clock, LlmCaller, LlmService } from "@/ports";
import { InsufficientCreditsPortError } from "@/ports";

const DEFAULT_MAX_COMPLETION_TOKENS = 2048;
const CHARS_PER_TOKEN_ESTIMATE = 4;

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

  // Preflight credit check before calling the provider using a conservative estimate
  const estimatedTotalTokens = estimateTotalTokens(trimmedMessages);
  const estimatedCost = calculateCost({ totalTokens: estimatedTotalTokens });
  const currentBalance = await accountService.getBalance(
    caller.billingAccountId
  );

  if (currentBalance < estimatedCost) {
    throw new InsufficientCreditsPortError(
      caller.billingAccountId,
      estimatedCost,
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
    typeof providerMeta.model === "string" ? providerMeta.model : undefined;
  const provider =
    typeof providerMeta.provider === "string"
      ? providerMeta.provider
      : undefined;
  const llmRequestId =
    typeof providerMeta.requestId === "string"
      ? providerMeta.requestId
      : undefined;
  const cost = calculateCost(
    modelId !== undefined ? { modelId, totalTokens } : { totalTokens }
  );

  const debitMetadata: Record<string, unknown> = {};
  if (result.usage) debitMetadata.usage = result.usage;
  if (modelId) debitMetadata.model = modelId;
  if (provider) debitMetadata.provider = provider;
  if (llmRequestId) debitMetadata.llmRequestId = llmRequestId;
  debitMetadata.virtualKeyId = caller.virtualKeyId;

  try {
    await accountService.debitForUsage({
      billingAccountId: caller.billingAccountId,
      virtualKeyId: caller.virtualKeyId,
      cost,
      requestId,
      metadata: debitMetadata,
    });
  } catch (error) {
    // If we reached the provider, do not fail the response on post-call debit errors
    if (!(error instanceof InsufficientCreditsPortError)) {
      throw error;
    }
  }

  // Feature sets timestamp after completion using injected clock
  return {
    ...result.message,
    timestamp: clock.now(),
  };
}
