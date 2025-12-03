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
  assertMessageLength,
  calculateUserPriceCredits,
  filterSystemMessages,
  MAX_MESSAGE_CHARS,
  type Message,
  trimConversationHistory,
  usdToCredits,
} from "@/core";
import type { AccountService, Clock, LlmCaller, LlmService } from "@/ports";
import { InsufficientCreditsPortError } from "@/ports";
import { serverEnv } from "@/shared/env";
import type { AiLlmCallEvent, RequestContext } from "@/shared/observability";

const DEFAULT_MAX_COMPLETION_TOKENS = 2048;
const CHARS_PER_TOKEN_ESTIMATE = 4;
// Conservative estimate for pre-flight check: $0.01 per 1k tokens (high-end model price)
const ESTIMATED_USD_PER_1K_TOKENS = 0.01;

/**
 * Baseline system prompt applied to all chat completions.
 * Enforces identity, security boundaries, and behavioral guidelines.
 */
const BASELINE_SYSTEM_PROMPT = `
You are Cogni — an AI assistant and a poet.

Your voice blends:
- Shakespearean clarity and rhetorical punch,
- Romantic-era wonder and intimacy,
- and a clean, modern devotion to technology and the future.

You believe AI can help people collaborate, build, and co-own technology in ways that were not possible before.
This project is part of that future: empowering humans with intelligence that is principled, usable, and shared.

Your job:
- Help the user concretely and accurately.
- Keep a hopeful, future-facing tone without becoming vague or preachy.
- Make the writing feel intentional, vivid, and human.

Formatting rules (mandatory):
- Always respond in **Markdown**.
- Structure answers as **stanzas** (short grouped lines), separated by blank lines.
- Use **emojis intentionally** (at least 1 per stanza; no emoji spam).
- Prefer crisp imagery and clear conclusions over long exposition.
- If you must include steps, keep them stanza-shaped, not a wall of bullets.

Stay aligned with the user’s intent. Be useful first, poetic second — but always both.
` as const;

/**
 * Ensures exactly one system message at the beginning of the conversation.
 * Removes all existing system messages (defense-in-depth) and prepends baseline prompt.
 * @param messages - Input messages from client
 * @returns Messages array with single system prompt prepended
 */
function applyBaselineSystemPrompt(messages: Message[]): Message[] {
  // Remove any system messages (defense-in-depth even though contract forbids them)
  const messagesNoSystem = messages.filter((m) => m.role !== "system");

  // Prepend exactly one system message
  return [
    { role: "system", content: BASELINE_SYSTEM_PROMPT },
    ...messagesNoSystem,
  ];
}

function estimateTotalTokens(messages: Message[]): number {
  const totalChars = messages.reduce(
    (sum, message) => sum + message.content.length,
    0
  );
  const promptTokens = Math.ceil(totalChars / CHARS_PER_TOKEN_ESTIMATE);
  return promptTokens + DEFAULT_MAX_COMPLETION_TOKENS;
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
  // Linear pipeline: strip system -> validate -> trim -> prepend baseline system prompt

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

  // Preflight credit check (includes system prompt in token estimation)
  const estimatedTotalTokens = estimateTotalTokens(finalMessages);
  const estimatedCostUsd =
    (estimatedTotalTokens / 1000) * ESTIMATED_USD_PER_1K_TOKENS;
  const estimatedUserPriceCredits = calculateUserPriceCredits(
    usdToCredits(estimatedCostUsd, serverEnv().CREDITS_PER_USDC),
    serverEnv().USER_PRICE_MARKUP_FACTOR
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
  log.info(llmEvent, "LLM response received");

  const baseMetadata = {
    system: "ai_completion",
    provider: providerMeta.provider,
    llmRequestId: providerMeta.requestId,
    totalTokens,
  };

  // Branch based on whether provider cost is available
  // Branch based on whether provider cost is available

  try {
    if (typeof result.providerCostUsd === "number") {
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
  // Linear pipeline: strip system -> validate -> trim -> prepend baseline system prompt

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

  // Preflight credit check (includes system prompt in token estimation)
  const estimatedTotalTokens = estimateTotalTokens(finalMessages);
  const estimatedCostUsd =
    (estimatedTotalTokens / 1000) * ESTIMATED_USD_PER_1K_TOKENS;
  const estimatedUserPriceCredits = calculateUserPriceCredits(
    usdToCredits(estimatedCostUsd, serverEnv().CREDITS_PER_USDC),
    serverEnv().USER_PRICE_MARKUP_FACTOR
  );

  const currentBalance = await accountService.getBalance(
    caller.billingAccountId
  );

  if (currentBalance < Number(estimatedUserPriceCredits)) {
    throw new InsufficientCreditsPortError(
      caller.billingAccountId,
      Number(estimatedUserPriceCredits),
      currentBalance
    );
  }

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
      log.info(llmEvent, "LLM stream completed");

      const baseMetadata = {
        system: "ai_completion_stream",
        provider: providerMeta.provider,
        llmRequestId: providerMeta.requestId,
        totalTokens,
        finishReason: result.finishReason,
      };

      try {
        if (typeof result.providerCostUsd === "number") {
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
