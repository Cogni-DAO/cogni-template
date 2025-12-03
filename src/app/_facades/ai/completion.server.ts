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

import type { z } from "zod";

import { resolveAiDeps } from "@/bootstrap/container";
import type { aiCompletionOperation } from "@/contracts/ai.completion.v1.contract";
import { mapAccountsPortErrorToFeature } from "@/features/accounts/public";
import { execute } from "@/features/ai/services/completion";
import {
  fromCoreMessage,
  type MessageDto,
  toCoreMessages,
} from "@/features/ai/services/mappers";
import { getOrCreateBillingAccountForUser } from "@/lib/auth/mapping";
import type { LlmCaller } from "@/ports";
import {
  isBillingAccountNotFoundPortError,
  isInsufficientCreditsPortError,
  isVirtualKeyNotFoundPortError,
} from "@/ports";
import type { SessionUser } from "@/shared/auth";
import type { RequestContext } from "@/shared/observability";

interface CompletionInput {
  messages: MessageDto[];
  model: string;
  sessionUser: SessionUser;
}

// Type-level enforcement: facade MUST return exact contract shape
type CompletionOutput = z.infer<typeof aiCompletionOperation.output>;

export async function completion(
  input: CompletionInput,
  ctx: RequestContext
): Promise<CompletionOutput> {
  // Resolve dependencies from bootstrap (pure composition root)
  const { llmService, accountService, clock } = resolveAiDeps();

  const billingAccount = await getOrCreateBillingAccountForUser(
    accountService,
    {
      userId: input.sessionUser.id,
      ...(input.sessionUser.walletAddress
        ? { walletAddress: input.sessionUser.walletAddress }
        : {}),
    }
  );

  const caller: LlmCaller = {
    billingAccountId: billingAccount.id,
    virtualKeyId: billingAccount.defaultVirtualKeyId,
    litellmVirtualKey: billingAccount.litellmVirtualKey,
  };

  // Enrich context with business identifiers
  const enrichedCtx: RequestContext = {
    ...ctx,
    log: ctx.log.child({
      userId: input.sessionUser.id,
      billingAccountId: billingAccount.id,
    }),
  };

  // Map DTOs to core types using feature mappers (no core imports here)
  const timestamp = clock.now();
  const coreMessages = toCoreMessages(input.messages, timestamp);

  try {
    // Execute pure feature with injected dependencies
    const result = await execute(
      coreMessages,
      input.model,
      llmService,
      accountService,
      clock,
      caller,
      enrichedCtx
    );

    // Map core result back to DTO
    const messageDto = fromCoreMessage(result.message);

    return {
      message: {
        ...messageDto,
        requestId: result.requestId,
      },
    };
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
