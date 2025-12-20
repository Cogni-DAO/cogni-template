// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/ai/services/completion`
 * Purpose: Use case orchestration for AI completion with dual-cost billing.
 * Scope: Coordinate core rules, port calls, record usage, return StreamFinalResult. Does not handle authentication or rate limiting.
 * Invariants:
 * - Only imports core, ports, shared - never contracts or adapters
 * - Pre-call credit check enforced; post-call billing never blocks response
 * - request_id is stable per request entry (ctx.reqId), NOT regenerated per LLM call
 * Side-effects: IO (via ports)
 * Notes: Uses adapter promptHash when available (canonical); logs warnings when cost is zero; post-call billing errors swallowed to preserve UX
 * Links: Called by API routes, uses core domain and ports, types/billing.ts (categorization)
 * @public
 */

import { randomUUID } from "node:crypto";
import type { Logger } from "pino";
import type { Message } from "@/core";
import type { StreamFinalResult } from "@/features/ai/types";
import type {
  AccountService,
  AiTelemetryPort,
  Clock,
  LangfusePort,
  LlmCaller,
  LlmCompletionResult,
  LlmService,
} from "@/ports";
import { LlmError } from "@/ports";
import {
  type AiLlmCallEvent,
  classifyLlmError,
  type RequestContext,
} from "@/shared/observability";
import { recordBilling } from "./billing";
import { prepareMessages } from "./message-preparation";
import { recordMetrics } from "./metrics";
import { validateCreditsUpperBound } from "./preflight-credit-check";
import { recordTelemetry } from "./telemetry";

// ============================================================================
// P3: Shared post-call handling (DRY consolidation)
// ============================================================================

/**
 * Context for post-call handling (shared between execute and executeStream).
 */
interface PostCallContext {
  readonly invocationId: string;
  readonly requestId: string;
  readonly traceId: string;
  readonly routeId: string;
  readonly fallbackPromptHash: string;
  readonly requestedModel: string;
  readonly llmStart: number;
  readonly caller: LlmCaller;
  readonly provenance: "response" | "stream";
  readonly accountService: AccountService;
  readonly aiTelemetry: AiTelemetryPort;
  readonly langfuse: LangfusePort | undefined;
}

/**
 * Handle successful LLM completion (metrics, billing, telemetry).
 * Used by both execute() and executeStream().
 */
async function handleLlmSuccess(
  result: LlmCompletionResult,
  context: PostCallContext,
  log: Logger
): Promise<void> {
  const {
    invocationId,
    requestId,
    traceId,
    routeId,
    fallbackPromptHash,
    requestedModel,
    llmStart,
    caller,
    provenance,
    accountService,
    aiTelemetry,
    langfuse,
  } = context;

  // Extract model ID from provider metadata
  const totalTokens = result.usage?.totalTokens ?? 0;
  const providerMeta = (result.providerMeta ?? {}) as Record<string, unknown>;
  const modelId =
    typeof providerMeta.model === "string" ? providerMeta.model : "unknown";

  // Invariant enforcement: log when model resolution fails
  if (modelId === "unknown") {
    log.warn(
      {
        requestId,
        requestedModel,
        streaming: provenance === "stream",
        hasProviderMeta: !!result.providerMeta,
        providerMetaKeys: result.providerMeta
          ? Object.keys(result.providerMeta)
          : [],
      },
      "inv_provider_meta_model_missing: Model name missing from LLM response"
    );
  }

  // Log LLM call with structured event
  const durationMs = performance.now() - llmStart;
  const llmEvent: AiLlmCallEvent = {
    event: "ai.llm_call",
    routeId,
    reqId: requestId,
    billingAccountId: caller.billingAccountId,
    model: modelId,
    durationMs,
    tokensUsed: totalTokens,
    providerCostUsd: result.providerCostUsd,
  };
  log.info(llmEvent, "ai.llm_call_completed");

  // Record LLM metrics
  await recordMetrics({
    model: modelId,
    durationMs,
    ...(totalTokens !== undefined && { tokensUsed: totalTokens }),
    ...(result.providerCostUsd !== undefined && {
      providerCostUsd: result.providerCostUsd,
    }),
    isError: false,
  });

  // Post-call billing (non-blocking, handles errors internally)
  await recordBilling(
    {
      billingAccountId: caller.billingAccountId,
      virtualKeyId: caller.virtualKeyId,
      requestId,
      model: modelId,
      providerCostUsd: result.providerCostUsd,
      litellmCallId: result.litellmCallId,
      provenance,
    },
    accountService,
    log
  );

  // Record success telemetry
  const latencyMs = Math.max(0, Math.round(durationMs));
  await recordTelemetry(
    {
      invocationId,
      requestId,
      traceId,
      fallbackPromptHash,
      canonicalPromptHash: result.promptHash,
      model: modelId,
      latencyMs,
      status: "success",
      resolvedProvider: result.resolvedProvider,
      resolvedModel: result.resolvedModel,
      usage: result.usage,
      providerCostUsd: result.providerCostUsd,
      litellmCallId: result.litellmCallId,
    },
    aiTelemetry,
    langfuse,
    log
  );
}

/**
 * Handle failed LLM completion (metrics, telemetry).
 * Used by both execute() and executeStream().
 * Note: Does NOT call recordBilling (no charge on error).
 */
async function handleLlmError(
  error: unknown,
  context: PostCallContext,
  log: Logger
): Promise<void> {
  const {
    invocationId,
    requestId,
    traceId,
    fallbackPromptHash,
    requestedModel,
    llmStart,
    aiTelemetry,
    langfuse,
  } = context;

  const durationMs = performance.now() - llmStart;

  // Record error metric
  const errorCode = classifyLlmError(error);
  await recordMetrics({
    model: requestedModel,
    durationMs,
    isError: true,
    errorCode,
  });

  // Record error telemetry
  const latencyMs = Math.max(0, Math.round(durationMs));
  const errorKind = error instanceof LlmError ? error.kind : "unknown";
  await recordTelemetry(
    {
      invocationId,
      requestId,
      traceId,
      fallbackPromptHash,
      model: requestedModel,
      latencyMs,
      status: "error",
      errorCode: errorKind,
    },
    aiTelemetry,
    langfuse,
    log
  );
}

// ============================================================================
// Public API (frozen signatures per API_FROZEN invariant)
// ============================================================================

export async function execute(
  messages: Message[],
  model: string,
  llmService: LlmService,
  accountService: AccountService,
  clock: Clock,
  caller: LlmCaller,
  ctx: RequestContext,
  aiTelemetry: AiTelemetryPort,
  langfuse: LangfusePort | undefined
): Promise<{ message: Message; requestId: string }> {
  const log = ctx.log.child({ feature: "ai.completion" });

  // Prepare messages + get fallback hash
  const {
    messages: finalMessages,
    fallbackPromptHash,
    estimatedTokensUpperBound,
  } = prepareMessages(messages, model);

  // Pre-flight credit check (upper-bound estimate)
  await validateCreditsUpperBound(
    caller.billingAccountId,
    estimatedTokensUpperBound,
    model,
    accountService
  );

  // Per spec: request_id is stable per request entry (from ctx.reqId)
  const requestId = ctx.reqId;
  // Per AI_SETUP_SPEC.md: invocation_id is unique per LLM call attempt
  const invocationId = randomUUID();
  const llmStart = performance.now();

  // Build shared context for post-call handling
  const postCallContext: PostCallContext = {
    invocationId,
    requestId,
    traceId: ctx.traceId,
    routeId: ctx.routeId,
    fallbackPromptHash,
    requestedModel: model,
    llmStart,
    caller,
    provenance: "response",
    accountService,
    aiTelemetry,
    langfuse,
  };

  // Execute LLM call
  log.debug({ messageCount: finalMessages.length }, "calling LLM");
  let result: LlmCompletionResult;
  try {
    result = await llmService.completion({
      messages: finalMessages,
      model,
      caller,
    });
  } catch (error) {
    await handleLlmError(error, postCallContext, log);
    throw error;
  }

  // Handle success (metrics, billing, telemetry)
  await handleLlmSuccess(result, postCallContext, log);

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
  aiTelemetry: AiTelemetryPort;
  langfuse: LangfusePort | undefined;
  abortSignal?: AbortSignal;
}

export async function executeStream({
  messages,
  model,
  llmService,
  accountService,
  clock: _clock,
  caller,
  ctx,
  aiTelemetry,
  langfuse,
  abortSignal,
}: ExecuteStreamParams): Promise<{
  stream: AsyncIterable<import("@/ports").ChatDeltaEvent>;
  final: Promise<StreamFinalResult>;
}> {
  const log = ctx.log.child({ feature: "ai.completion.stream" });

  // Prepare messages + get fallback hash
  const {
    messages: finalMessages,
    fallbackPromptHash,
    estimatedTokensUpperBound,
  } = prepareMessages(messages, model);

  // Pre-flight credit check (upper-bound estimate)
  await validateCreditsUpperBound(
    caller.billingAccountId,
    estimatedTokensUpperBound,
    model,
    accountService
  );

  // Per spec: request_id is stable per request entry (from ctx.reqId)
  const requestId = ctx.reqId;
  // Per AI_SETUP_SPEC.md: invocation_id is unique per LLM call attempt
  const invocationId = randomUUID();
  const llmStart = performance.now();

  // Build shared context for post-call handling
  const postCallContext: PostCallContext = {
    invocationId,
    requestId,
    traceId: ctx.traceId,
    routeId: ctx.routeId,
    fallbackPromptHash,
    requestedModel: model,
    llmStart,
    caller,
    provenance: "stream",
    accountService,
    aiTelemetry,
    langfuse,
  };

  log.debug({ messageCount: finalMessages.length }, "starting LLM stream");

  const { stream, final } = await llmService.completionStream({
    messages: finalMessages,
    model,
    caller,
    ...(abortSignal ? { abortSignal } : {}),
  });

  // Wrap final promise to handle billing/telemetry
  // INVARIANT: STREAMING_SIDE_EFFECTS_ONCE - side effects fire ONLY from this promise
  const wrappedFinal = final
    .then(async (result) => {
      await handleLlmSuccess(result, postCallContext, log);

      return {
        ok: true as const,
        requestId,
        usage: {
          promptTokens: result.usage?.promptTokens ?? 0,
          completionTokens: result.usage?.completionTokens ?? 0,
        },
        finishReason: result.finishReason ?? "stop",
      };
    })
    .catch(async (error) => {
      log.error({ err: error, requestId }, "Stream execution failed");
      await handleLlmError(error, postCallContext, log);

      // Return discriminated union instead of throwing
      const isAborted = error instanceof Error && error.name === "AbortError";
      return {
        ok: false as const,
        requestId,
        error: isAborted ? ("aborted" as const) : ("internal" as const),
      };
    });

  return { stream, final: wrappedFinal };
}
