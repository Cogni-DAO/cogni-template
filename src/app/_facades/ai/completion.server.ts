// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/_facades/ai/completion.server`
 * Purpose: App-layer coordinator for AI completion - session → billing account, delegates to feature layer.
 * Scope: Resolves session user to billing account + virtual key, creates LlmCaller, maps DTOs, normalizes errors. Does not contain business logic or HTTP concerns.
 * Invariants:
 *   - Only app layer imports this; routes call this, not features/* directly
 *   - Must import features via public.ts ONLY (never import from services subdirectories)
 *   - Validates billing account before delegation; propagates feature errors
 * Side-effects: IO (via resolved dependencies)
 * Notes: Uses accounts feature for validation; propagates AccountsFeatureError to routes
 * Links: Called by API routes, delegates to features/ai/public.ts
 * @public
 */

import type { z } from "zod";

import { resolveAiDeps } from "@/bootstrap/container";
import type { aiCompletionOperation } from "@/contracts/ai.completion.v1.contract";
import { mapAccountsPortErrorToFeature } from "@/features/accounts/public";
// Import from public.server.ts - never from services/* directly (dep-cruiser enforced)
import {
  execute,
  fromCoreMessage,
  type MessageDto,
  toCoreMessages,
} from "@/features/ai/public.server";
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
  const { llmService, accountService, clock, aiTelemetry, langfuse } =
    resolveAiDeps();

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
    requestId: ctx.reqId,
    traceId: ctx.traceId,
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
      enrichedCtx,
      aiTelemetry,
      langfuse
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

/**
 * Stream chat completion via AI streaming service.
 * App facade responsibility: session → billing account, caller creation, error mapping.
 * NO business logic here - delegates to feature layer via public.ts.
 */
export async function completionStream(
  input: CompletionInput & { abortSignal?: AbortSignal },
  ctx: RequestContext
): Promise<{
  stream: AsyncIterable<import("@/features/ai/public").AiEvent>;
  final: Promise<import("@/features/ai/public").StreamFinalResult>;
}> {
  const { llmService, accountService, clock, aiTelemetry, langfuse } =
    resolveAiDeps();

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
    requestId: ctx.reqId,
    traceId: ctx.traceId,
  };

  const enrichedCtx: RequestContext = {
    ...ctx,
    log: ctx.log.child({
      userId: input.sessionUser.id,
      billingAccountId: billingAccount.id,
    }),
  };

  const timestamp = clock.now();
  const coreMessages = toCoreMessages(input.messages, timestamp);

  try {
    // Import from public.server.ts - never from services/* directly
    const { createAiRuntime } = await import("@/features/ai/public.server");
    const aiRuntime = createAiRuntime({
      llmService,
      accountService,
      clock,
      aiTelemetry,
      langfuse,
    });

    const { stream, final } = await aiRuntime.runChatStream(
      {
        messages: coreMessages,
        model: input.model,
        caller,
        ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      },
      enrichedCtx
    );

    return { stream, final };
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
