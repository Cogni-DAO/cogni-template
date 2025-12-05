// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/ai/services/completion`
 * Purpose: Use case orchestration for AI completion with dual-cost billing.
 * Scope: Coordinate core rules, port calls, set output timestamp, record usage. Does not handle authentication or rate limiting.
 * Invariants: Only imports core, ports, shared - never contracts or adapters; pre-call credit check enforced; post-call billing never blocks response
 * Side-effects: IO (via ports)
 * Notes: Logs warnings when cost is zero; post-call billing errors swallowed to preserve UX
 * Links: Called by API routes, uses core domain and ports
 * @public
 */

import { randomUUID } from "node:crypto";

import {
  applyBaselineSystemPrompt,
  assertMessageLength,
  calculateUserPriceCredits,
  ESTIMATED_USD_PER_1K_TOKENS,
  estimateTotalTokens,
  filterSystemMessages,
  MAX_MESSAGE_CHARS,
  type Message,
  trimConversationHistory,
  usdToCredits,
} from "@/core";
import type { AccountService, Clock, LlmCaller, LlmService } from "@/ports";
import { InsufficientCreditsPortError } from "@/ports";
import { isModelFree } from "@/shared/ai/model-catalog.server";
import { serverEnv } from "@/shared/env";
import type { AiLlmCallEvent, RequestContext } from "@/shared/observability";

/**
 * Estimate cost in credits for a given model and token count.
 * Invariant: Free models MUST return 0n. Paid models return >0n.
 */
async function estimateCostCredits(
  model: string,
  estimatedTotalTokens: number
): Promise<bigint> {
  if (await isModelFree(model)) {
    return 0n;
  }

  const estimatedCostUsd =
    (estimatedTotalTokens / 1000) * ESTIMATED_USD_PER_1K_TOKENS;
  return calculateUserPriceCredits(
    usdToCredits(estimatedCostUsd, serverEnv().CREDITS_PER_USDC),
    serverEnv().USER_PRICE_MARKUP_FACTOR
  );
}

/**
 * Prepares messages for LLM execution:
 * 1. Filters system messages
 * 2. Validates length
 * 3. Trims history
 * 4. Applies baseline system prompt
 * 5. Performs pre-flight credit check
 */
async function prepareForExecution(
  messages: Message[],
  model: string,
  caller: LlmCaller,
  accountService: AccountService
): Promise<Message[]> {
  // 1. Remove any client-provided system messages (defense-in-depth)
  const userMessages = filterSystemMessages(messages);

  // 2. Validate message length
  for (const message of userMessages) {
    assertMessageLength(message.content, MAX_MESSAGE_CHARS);
  }

  // 3. Trim conversation history to fit context window
  const trimmedMessages = trimConversationHistory(
    userMessages,
    MAX_MESSAGE_CHARS
  );

  // 4. Prepend baseline system prompt (exactly once, always first)
  const finalMessages = applyBaselineSystemPrompt(trimmedMessages);

  // 5. Preflight credit check (includes system prompt in token estimation)
  const estimatedTotalTokens = estimateTotalTokens(finalMessages);
  const estimatedUserPriceCredits = await estimateCostCredits(
    model,
    estimatedTotalTokens
  );

  const currentBalance = await accountService.getBalance(
    caller.billingAccountId
  );

  // Convert bigint to number for comparison (safe for pre-flight check)
  if (currentBalance < Number(estimatedUserPriceCredits)) {
    throw new InsufficientCreditsPortError(
      caller.billingAccountId,
      Number(estimatedUserPriceCredits),
      currentBalance
    );
  }

  return finalMessages;
}

export async function execute(
  messages: Message[],
  model: string,
  llmService: LlmService,
  accountService: AccountService,
  clock: Clock,
  caller: LlmCaller,
  ctx: RequestContext
): Promise<{ message: Message; requestId: string }> {
  const log = ctx.log.child({ feature: "ai.completion" });

  const finalMessages = await prepareForExecution(
    messages,
    model,
    caller,
    accountService
  );

  const requestId = randomUUID();

  // Delegate to port - caller constructed at auth boundary
  log.debug({ messageCount: finalMessages.length }, "calling LLM");
  const llmStart = performance.now();

  const result = await llmService.completion({
    messages: finalMessages,
    model,
    caller,
  });

  const totalTokens = result.usage?.totalTokens ?? 0;
  const providerMeta = (result.providerMeta ?? {}) as Record<string, unknown>;
  const modelId =
    typeof providerMeta.model === "string" ? providerMeta.model : "unknown";

  // Invariant enforcement: log when model resolution fails
  if (modelId === "unknown") {
    log.warn(
      {
        requestId,
        requestedModel: model,
        streaming: false,
        hasProviderMeta: !!result.providerMeta,
        providerMetaKeys: result.providerMeta
          ? Object.keys(result.providerMeta)
          : [],
      },
      "inv_provider_meta_model_missing: Model name missing from LLM response"
    );
  }

  // Log LLM call with structured event
  const llmEvent: AiLlmCallEvent = {
    event: "ai.llm_call",
    routeId: ctx.routeId,
    reqId: ctx.reqId,
    billingAccountId: caller.billingAccountId,
    model: modelId,
    durationMs: performance.now() - llmStart,
    tokensUsed: totalTokens,
    providerCostUsd: result.providerCostUsd,
  };
  log.info(llmEvent, "ai.llm_call_completed");

  const baseMetadata = {
    system: "ai_completion",
    provider: providerMeta.provider,
    llmRequestId: providerMeta.requestId,
    totalTokens,
  };

  // Branch based on whether provider cost is available
  try {
    const isFree = await isModelFree(modelId);

    if (isFree) {
      // Free model - record as billed with 0 cost
      await accountService.recordLlmUsage({
        billingStatus: "billed",
        billingAccountId: caller.billingAccountId,
        virtualKeyId: caller.virtualKeyId,
        requestId,
        model: modelId,
        promptTokens: result.usage?.promptTokens ?? 0,
        completionTokens: result.usage?.completionTokens ?? 0,
        providerCostUsd: 0,
        providerCostCredits: 0n,
        userPriceCredits: 0n,
        markupFactorApplied: serverEnv().USER_PRICE_MARKUP_FACTOR,
        metadata: baseMetadata,
      });
    } else if (typeof result.providerCostUsd === "number") {
      // Cost available - calculate markup and bill user
      const markupFactor = serverEnv().USER_PRICE_MARKUP_FACTOR;
      const providerCostCredits = usdToCredits(
        result.providerCostUsd,
        serverEnv().CREDITS_PER_USDC
      );
      const userPriceCredits = calculateUserPriceCredits(
        providerCostCredits,
        markupFactor
      );

      // Enforce profit margin invariant
      if (userPriceCredits < providerCostCredits) {
        log.error(
          {
            userPriceCredits,
            providerCostCredits,
            requestId,
          },
          "Invariant violation: User price < Provider cost"
        );
      }

      await accountService.recordLlmUsage({
        billingStatus: "billed",
        billingAccountId: caller.billingAccountId,
        virtualKeyId: caller.virtualKeyId,
        requestId,
        model: modelId,
        promptTokens: result.usage?.promptTokens ?? 0,
        completionTokens: result.usage?.completionTokens ?? 0,
        providerCostUsd: result.providerCostUsd,
        providerCostCredits,
        userPriceCredits,
        markupFactorApplied: markupFactor,
        metadata: baseMetadata,
      });
    } else {
      // No cost available - record usage but don't bill
      await accountService.recordLlmUsage({
        billingStatus: "needs_review",
        billingAccountId: caller.billingAccountId,
        virtualKeyId: caller.virtualKeyId,
        requestId,
        model: modelId,
        promptTokens: result.usage?.promptTokens ?? 0,
        completionTokens: result.usage?.completionTokens ?? 0,
        metadata: baseMetadata,
      });
    }
  } catch (error) {
    // Post-call billing is best-effort - NEVER block user response after LLM succeeded
    if (error instanceof InsufficientCreditsPortError) {
      // Pre-flight passed but post-call failed - race condition or concurrent usage
      log.warn(
        {
          requestId,
          billingAccountId: caller.billingAccountId,
          required: error.cost,
          available: error.previousBalance,
        },
        "Post-call insufficient credits (user got response for free)"
      );
    } else {
      // Other errors (DB down, FK constraint, etc.) are operational issues
      log.error(
        {
          err: error,
          requestId,
          billingAccountId: caller.billingAccountId,
        },
        "CRITICAL: Post-call billing failed - user response NOT blocked"
      );
    }
    // DO NOT RETHROW - user already got LLM response, must see it
    // EXCEPT in test environment where we need to catch these issues
    if (serverEnv().APP_ENV === "test") {
      throw error;
    }
  }

  // Feature sets timestamp after completion using injected clock
  return {
    message: {
      ...result.message,
      timestamp: clock.now(),
    },
    requestId,
  };
}

export interface ExecuteStreamParams {
  messages: Message[];
  model: string;
  llmService: LlmService;
  accountService: AccountService;
  clock: Clock;
  caller: LlmCaller;
  ctx: RequestContext;
  abortSignal?: AbortSignal;
}

export async function executeStream({
  messages,
  model,
  llmService,
  accountService,
  clock,
  caller,
  ctx,
  abortSignal,
}: ExecuteStreamParams): Promise<{
  stream: AsyncIterable<import("@/ports").ChatDeltaEvent>;
  final: Promise<{ message: Message; requestId: string }>;
}> {
  const log = ctx.log.child({ feature: "ai.completion.stream" });

  const finalMessages = await prepareForExecution(
    messages,
    model,
    caller,
    accountService
  );

  const requestId = randomUUID();
  log.debug({ messageCount: finalMessages.length }, "starting LLM stream");
  const llmStart = performance.now();

  const { stream, final } = await llmService.completionStream({
    messages: finalMessages,
    model,
    caller,
    // Explicitly handle optional property
    ...(abortSignal ? { abortSignal } : {}),
  });

  // Wrap final promise to handle billing
  const wrappedFinal = final
    .then(async (result) => {
      const totalTokens = result.usage?.totalTokens ?? 0;
      const providerMeta = (result.providerMeta ?? {}) as Record<
        string,
        unknown
      >;
      const modelId =
        typeof providerMeta.model === "string" ? providerMeta.model : "unknown";

      // Invariant enforcement: log when model resolution fails
      if (modelId === "unknown") {
        log.warn(
          {
            requestId,
            requestedModel: model,
            streaming: true,
            hasProviderMeta: !!result.providerMeta,
            providerMetaKeys: result.providerMeta
              ? Object.keys(result.providerMeta)
              : [],
          },
          "inv_provider_meta_model_missing: Model name missing from LLM stream response"
        );
      }

      const llmEvent: AiLlmCallEvent = {
        event: "ai.llm_call",
        routeId: ctx.routeId,
        reqId: ctx.reqId,
        billingAccountId: caller.billingAccountId,
        model: modelId,
        durationMs: performance.now() - llmStart,
        tokensUsed: totalTokens,
        providerCostUsd: result.providerCostUsd,
      };
      log.info(llmEvent, "ai.llm_call_completed");

      const baseMetadata = {
        system: "ai_completion_stream",
        provider: providerMeta.provider,
        llmRequestId: providerMeta.requestId,
        totalTokens,
        finishReason: result.finishReason,
      };

      try {
        const isFree = await isModelFree(modelId);

        if (isFree) {
          // Free model - record as billed with 0 cost
          await accountService.recordLlmUsage({
            billingStatus: "billed",
            billingAccountId: caller.billingAccountId,
            virtualKeyId: caller.virtualKeyId,
            requestId, // Idempotency key
            model: modelId,
            promptTokens: result.usage?.promptTokens ?? 0,
            completionTokens: result.usage?.completionTokens ?? 0,
            providerCostUsd: 0,
            providerCostCredits: 0n,
            userPriceCredits: 0n,
            markupFactorApplied: serverEnv().USER_PRICE_MARKUP_FACTOR,
            metadata: baseMetadata,
          });
        } else if (typeof result.providerCostUsd === "number") {
          const markupFactor = serverEnv().USER_PRICE_MARKUP_FACTOR;
          const providerCostCredits = usdToCredits(
            result.providerCostUsd,
            serverEnv().CREDITS_PER_USDC
          );
          const userPriceCredits = calculateUserPriceCredits(
            providerCostCredits,
            markupFactor
          );

          if (userPriceCredits < providerCostCredits) {
            log.error(
              { userPriceCredits, providerCostCredits, requestId },
              "Invariant violation: User price < Provider cost"
            );
          }

          await accountService.recordLlmUsage({
            billingStatus: "billed",
            billingAccountId: caller.billingAccountId,
            virtualKeyId: caller.virtualKeyId,
            requestId, // Idempotency key
            model: modelId,
            promptTokens: result.usage?.promptTokens ?? 0,
            completionTokens: result.usage?.completionTokens ?? 0,
            providerCostUsd: result.providerCostUsd,
            providerCostCredits,
            userPriceCredits,
            markupFactorApplied: markupFactor,
            metadata: baseMetadata,
          });
        } else {
          await accountService.recordLlmUsage({
            billingStatus: "needs_review",
            billingAccountId: caller.billingAccountId,
            virtualKeyId: caller.virtualKeyId,
            requestId, // Idempotency key
            model: modelId,
            promptTokens: result.usage?.promptTokens ?? 0,
            completionTokens: result.usage?.completionTokens ?? 0,
            metadata: baseMetadata,
          });
        }
      } catch (error) {
        if (error instanceof InsufficientCreditsPortError) {
          log.warn(
            {
              requestId,
              billingAccountId: caller.billingAccountId,
              required: error.cost,
              available: error.previousBalance,
            },
            "Post-stream insufficient credits"
          );
        } else {
          log.error(
            {
              err: error,
              requestId,
              billingAccountId: caller.billingAccountId,
            },
            "CRITICAL: Post-stream billing failed"
          );
        }
        if (serverEnv().APP_ENV === "test") throw error;
      }

      return {
        message: {
          ...result.message,
          timestamp: clock.now(),
        },
        requestId,
      };
    })
    .catch((error) => {
      // If stream fails/aborts, we still want to record partial usage if available
      // But for now, we just log and rethrow.
      // Ideally, we'd catch AbortError and record partials if LiteLLM gave us any.
      log.error({ err: error, requestId }, "Stream execution failed");
      throw error;
    });

  return { stream, final: wrappedFinal };
}
