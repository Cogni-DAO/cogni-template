// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/_facades/ai/completion.server`
 * Purpose: App-layer facade for AI completion - coordinates billing account resolution and AI features.
 * Scope: Resolves session user to billing account + virtual key, delegates to AI completion feature. Does not handle HTTP concerns.
 * Invariants: Only app layer imports this; validates billing account before completion execution; propagates feature errors
 * Side-effects: IO (via resolved dependencies)
 * Notes: Uses accounts feature for validation via Result pattern; propagates AccountsFeatureError to routes
 * Links: Called by API routes, uses accounts and AI features
 * @public
 */

import { resolveAiDeps } from "@/bootstrap/container";
import { mapAccountsPortErrorToFeature } from "@/features/accounts/public";
import { execute } from "@/features/ai/services/completion";
import {
  fromCoreMessage,
  type MessageDto,
  toCoreMessages,
} from "@/features/ai/services/mappers";
import type { LlmCaller } from "@/ports";
import {
  isBillingAccountNotFoundPortError,
  isInsufficientCreditsPortError,
  isVirtualKeyNotFoundPortError,
} from "@/ports";
import type { SessionUser } from "@/shared/auth";

interface CompletionInput {
  messages: MessageDto[];
  sessionUser: SessionUser;
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

  const billingAccount = await accountService.getOrCreateBillingAccountForUser({
    userId: input.sessionUser.id,
    ...(input.sessionUser.walletAddress
      ? { walletAddress: input.sessionUser.walletAddress }
      : {}),
  });

  const caller: LlmCaller = {
    billingAccountId: billingAccount.id,
    virtualKeyId: billingAccount.defaultVirtualKeyId,
    litellmVirtualKey: billingAccount.litellmVirtualKey,
  };

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
      caller
    );

    // Map core result back to DTO
    const message = fromCoreMessage(result);

    return { message };
  } catch (error) {
    if (
      isInsufficientCreditsPortError(error) ||
      isBillingAccountNotFoundPortError(error) ||
      isVirtualKeyNotFoundPortError(error) ||
      mapAccountsPortErrorToFeature(error).kind !== "GENERIC"
    ) {
      throw mapAccountsPortErrorToFeature(error);
    }

    throw error;
  }
}
