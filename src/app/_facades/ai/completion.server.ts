// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/_facades/ai/completion.server`
 * Purpose: App-layer coordinator for AI completion - session → billing account, delegates to feature layer.
 * Scope: Resolves session user to billing account + virtual key, creates LlmCaller, maps DTOs, normalizes errors. Does not contain business logic or HTTP concerns.
 * Invariants:
 *   - UNIFIED_GRAPH_EXECUTOR: Both completion() and completionStream() use GraphExecutorPort
 *   - Only app layer imports this; routes call this, not features/* directly
 *   - Must import features via public.ts ONLY (never import from services subdirectories)
 *   - NEVER import adapters (use bootstrap factories instead)
 *   - Validates billing account before delegation; propagates feature errors
 * Side-effects: IO (via resolved dependencies)
 * Notes: completion() delegates to completionStream() and collects response server-side
 * Links: Called by API routes, delegates to features/ai/public.ts, GRAPH_EXECUTION.md
 * @public
 */

import type { z } from "zod";

import { resolveAiAdapterDeps } from "@/bootstrap/container";
import { createInProcGraphExecutor } from "@/bootstrap/graph-executor.factory";
import type { aiCompletionOperation } from "@/contracts/ai.completion.v1.contract";
import { mapAccountsPortErrorToFeature } from "@/features/accounts/public";
// Import from public.server.ts - never from services/* directly (dep-cruiser enforced)
import {
  createLangGraphChatRunner,
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
  /** Graph name to execute (default: "chat") */
  graphName?: string;
}

// Type-level enforcement: facade MUST return exact contract shape
type CompletionOutput = z.infer<typeof aiCompletionOperation.output>;

/**
 * Non-streaming AI completion.
 * Per UNIFIED_GRAPH_EXECUTOR: delegates to completionStream() and collects response server-side.
 * This ensures billing flows through GraphExecutorPort → RunEventRelay → commitUsageFact().
 */
export async function completion(
  input: CompletionInput,
  ctx: RequestContext
): Promise<CompletionOutput> {
  const { clock } = resolveAiAdapterDeps();

  // Delegate to streaming path (UNIFIED_GRAPH_EXECUTOR)
  const { stream, final } = await completionStream(input, ctx);

  // Collect text deltas server-side
  // Errors (including InsufficientCreditsPortError from preflight) occur lazily during consumption
  // Both stream consumption AND final await are wrapped - final can reject after loop completes
  const textParts: string[] = [];
  try {
    for await (const event of stream) {
      if (event.type === "text_delta") {
        textParts.push(event.delta);
      }
      // done event signals end of stream; billing already handled by RunEventRelay
      // Note: errors are thrown as exceptions, not emitted as events
    }

    // Await final to ensure billing completed via RunEventRelay
    const result = await final;

    if (!result.ok) {
      // Map error result to thrown error for route handler
      throw new Error(`Completion failed: ${result.error}`);
    }

    // Build response in contract format
    const content = textParts.join("");
    const timestamp = clock.now();

    return {
      message: {
        role: "assistant",
        content,
        timestamp,
        requestId: result.requestId,
      },
    };
  } catch (error) {
    // Map port-level errors to feature errors for route handler
    // Route layer handles AccountsFeatureError via isAccountsFeatureError() → 402/403
    if (
      isInsufficientCreditsPortError(error) ||
      isBillingAccountNotFoundPortError(error) ||
      isVirtualKeyNotFoundPortError(error)
    ) {
      throw mapAccountsPortErrorToFeature(error);
    }
    throw error; // Re-throw unknown errors
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
  // Per UNIFIED_GRAPH_EXECUTOR: use bootstrap factory (app → bootstrap → adapters)
  // Facade CANNOT import adapters - architecture boundary enforced by depcruise
  const { accountService, clock } = resolveAiAdapterDeps();
  const { executeStream } = await import("@/features/ai/public.server");

  // Build graph resolver: "chat" → LangGraph runner, else undefined (falls back to default)
  // Resolver receives adapter from bootstrap, facade imports runner from features
  const graphResolver = (
    graphName: string,
    adapter: Parameters<typeof createLangGraphChatRunner>[0]
  ) => (graphName === "chat" ? createLangGraphChatRunner(adapter) : undefined);

  // Create graph executor via bootstrap factory with resolver
  const graphExecutor = createInProcGraphExecutor(executeStream, graphResolver);

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
      graphExecutor,
      accountService,
    });

    // runChatStream is now synchronous (returns immediately with stream handle)
    const { stream, final } = aiRuntime.runChatStream(
      {
        messages: coreMessages,
        model: input.model,
        caller,
        ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
        ...(input.graphName ? { graphName: input.graphName } : {}),
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
