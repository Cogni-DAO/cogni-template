// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/_facades/ai/completion.server`
 * Purpose: App-layer facade for AI completion - coordinates accounts validation and AI features.
 * Scope: Validates API keys via accounts feature, delegates to AI completion feature. Does not handle authentication.
 * Invariants: Only app layer imports this; validates accounts before completion execution; propagates feature errors
 * Side-effects: IO (via resolved dependencies)
 * Notes: Uses accounts feature for validation via Result pattern; propagates AccountsFeatureError to routes
 * Links: Called by API routes, uses accounts and AI features
 * @public
 */

import { resolveAiDeps } from "@/bootstrap/container";
import type { AccountsFeatureError } from "@/features/accounts/public";
import { getAccountForApiKey } from "@/features/accounts/public";
import { execute } from "@/features/ai/services/completion";
import {
  fromCoreMessage,
  type MessageDto,
  toCoreMessages,
} from "@/features/ai/services/mappers";
import type { LlmCaller } from "@/ports";
import { isInsufficientCreditsPortError } from "@/ports";

interface CompletionInput {
  messages: MessageDto[];
  caller: LlmCaller;
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
  const { llmService, accountService, clock } = resolveAiDeps();

  // Validate account exists for the API key using accounts feature
  const accountResult = await getAccountForApiKey(
    accountService,
    input.caller.apiKey
  );
  if (!accountResult.ok) {
    // Propagate feature error to app layer
    const featureError: AccountsFeatureError = accountResult.error;
    throw featureError;
  }

  // Map DTOs to core types using feature mappers (no core imports here)
  const timestamp = clock.now();
  const coreMessages = toCoreMessages(input.messages, timestamp);

  try {
    // Execute pure feature with injected dependencies
    const result = await execute(
      coreMessages,
      llmService,
      accountService,
      clock,
      input.caller
    );

    // Map core result back to DTO
    const message = fromCoreMessage(result);

    return { message };
  } catch (error) {
    if (isInsufficientCreditsPortError(error)) {
      const featureError: AccountsFeatureError = {
        kind: "INSUFFICIENT_CREDITS",
        accountId: error.accountId,
        required: error.cost,
        available: error.previousBalance,
      };
      throw featureError;
    }

    throw error;
  }
}
