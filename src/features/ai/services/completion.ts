// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/ai/services/completion`
 * Purpose: Use case orchestration for AI completion.
 * Scope: Coordinate core rules, port calls, set output timestamp. Does not handle authentication or rate limiting.
 * Invariants: Only imports core, ports, shared - never contracts or adapters
 * Side-effects: IO (via ports)
 * Notes: Applies business rules then delegates to LLM service
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
import type { Clock, LlmService } from "@/ports";

export async function execute(
  messages: Message[],
  llmService: LlmService,
  clock: Clock
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

  // Delegate to port - adapter handles defaults from env
  const result = await llmService.completion({ messages: trimmedMessages });

  // Feature sets timestamp after completion using injected clock
  return {
    ...result.message,
    timestamp: clock.now(),
  };
}
