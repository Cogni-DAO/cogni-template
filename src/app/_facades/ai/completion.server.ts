// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/_facades/ai/completion.server`
 * Purpose: App-layer facade for AI completion - bridges DTOs to features
 * Scope: Coordinates DI resolution, DTO mapping, and feature execution
 * Invariants: Only app layer imports this; handles all coordination concerns
 * Side-effects: IO (via resolved dependencies)
 * Notes: Lives in app layer where it can see both bootstrap and features
 * Links: Called by API routes, uses bootstrap for DI and features for logic
 * @public
 */

import { resolveAiDeps } from "@/bootstrap/container";
import { execute } from "@/features/ai/services/completion";
import {
  fromCoreMessage,
  type MessageDto,
  toCoreMessages,
} from "@/features/ai/services/mappers";

interface CompletionInput {
  messages: MessageDto[];
}

interface CompletionOutput {
  message: {
    role: "assistant";
    content: string;
    timestamp: string;
  };
}

export async function completion(
  input: CompletionInput
): Promise<CompletionOutput> {
  // Resolve dependencies from bootstrap (pure composition root)
  const { llmService, clock } = resolveAiDeps();

  // Map DTOs to core types using feature mappers (no core imports here)
  const timestamp = clock.now();
  const coreMessages = toCoreMessages(input.messages, timestamp);

  // Execute pure feature with injected dependencies
  const result = await execute(coreMessages, llmService, clock);

  // Map core result back to DTO
  const message = fromCoreMessage(result);

  return { message };
}
