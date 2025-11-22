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

  await accountService.debitForUsage({
    billingAccountId: caller.billingAccountId,
    virtualKeyId: caller.virtualKeyId,
    cost,
    requestId,
    metadata: debitMetadata,
  });

  // Feature sets timestamp after completion using injected clock
  return {
    ...result.message,
    timestamp: clock.now(),
  };
}
