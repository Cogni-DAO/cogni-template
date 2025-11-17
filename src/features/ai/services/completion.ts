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

import {
  assertMessageLength,
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

  // Delegate to port - caller constructed at auth boundary
  const result = await llmService.completion({
    messages: trimmedMessages,
    caller,
  });

  // Feature sets timestamp after completion using injected clock
  return {
    ...result.message,
    timestamp: clock.now(),
  };
}
