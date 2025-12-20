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
import type { Message } from "@/core";
import type { StreamFinalResult } from "@/features/ai/types";
import type {
  AccountService,
  AiTelemetryPort,
  Clock,
  LangfusePort,
  LlmCaller,
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

  // P1: Use prepareMessages for message prep + fallback hash
  // Alias fallbackPromptHash as promptHash to minimize downstream changes
  const {
    messages: finalMessages,
    fallbackPromptHash: promptHash,
    estimatedTokensUpperBound,
  } = prepareMessages(messages, model);

  // P2: Pre-flight credit check (upper-bound estimate)
  await validateCreditsUpperBound(
    caller.billingAccountId,
    estimatedTokensUpperBound,
    model,
    accountService
  );

  // Per spec: request_id is stable per request entry (from ctx.reqId), NOT regenerated here
  const requestId = ctx.reqId;
  // Per AI_SETUP_SPEC.md: invocation_id is unique per LLM call attempt (idempotency key)
  const invocationId = randomUUID();

  // Delegate to port - caller constructed at auth boundary
  log.debug({ messageCount: finalMessages.length }, "calling LLM");
  const llmStart = performance.now();

  let result: Awaited<ReturnType<LlmService["completion"]>>;
  try {
    result = await llmService.completion({
      messages: finalMessages,
      model,
      caller,
    });
  } catch (error) {
    // Record error metric before rethrowing
    const errorCode = classifyLlmError(error);
    await recordMetrics({
      model,
      durationMs: performance.now() - llmStart,
      isError: true,
      errorCode,
    });

    // P2: Record error telemetry
    const latencyMs = Math.max(0, Math.round(performance.now() - llmStart));
    const errorKind = error instanceof LlmError ? error.kind : "unknown";
    await recordTelemetry(
      {
        invocationId,
        requestId: ctx.reqId,
        traceId: ctx.traceId,
        fallbackPromptHash: promptHash,
        model,
        latencyMs,
        status: "error",
        errorCode: errorKind,
      },
      aiTelemetry,
      langfuse,
      log
    );

    throw error;
  }

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

  // Record LLM metrics
  await recordMetrics({
    model: modelId,
    durationMs: llmEvent.durationMs,
    ...(llmEvent.tokensUsed !== undefined && {
      tokensUsed: llmEvent.tokensUsed,
    }),
    ...(llmEvent.providerCostUsd !== undefined && {
      providerCostUsd: llmEvent.providerCostUsd,
    }),
    isError: false,
  });

  // P2: Post-call billing (non-blocking, handles errors internally)
  await recordBilling(
    {
      billingAccountId: caller.billingAccountId,
      virtualKeyId: caller.virtualKeyId,
      requestId,
      model: modelId,
      providerCostUsd: result.providerCostUsd,
      litellmCallId: result.litellmCallId,
      provenance: "response",
    },
    accountService,
    log
  );

  // P2: Record success telemetry
  const latencyMs = Math.max(0, Math.round(llmEvent.durationMs));
  await recordTelemetry(
    {
      invocationId,
      requestId: ctx.reqId,
      traceId: ctx.traceId,
      fallbackPromptHash: promptHash,
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

  // P1: Use prepareMessages for message prep + fallback hash
  // Alias fallbackPromptHash as promptHash to minimize downstream changes
  const {
    messages: finalMessages,
    fallbackPromptHash: promptHash,
    estimatedTokensUpperBound,
  } = prepareMessages(messages, model);

  // P2: Pre-flight credit check (upper-bound estimate)
  await validateCreditsUpperBound(
    caller.billingAccountId,
    estimatedTokensUpperBound,
    model,
    accountService
  );

  // Per spec: request_id is stable per request entry (from ctx.reqId), NOT regenerated here
  const requestId = ctx.reqId;
  // Per AI_SETUP_SPEC.md: invocation_id is unique per LLM call attempt (idempotency key)
  const invocationId = randomUUID();

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

      // Record LLM metrics
      await recordMetrics({
        model: modelId,
        durationMs: llmEvent.durationMs,
        ...(llmEvent.tokensUsed !== undefined && {
          tokensUsed: llmEvent.tokensUsed,
        }),
        ...(llmEvent.providerCostUsd !== undefined && {
          providerCostUsd: llmEvent.providerCostUsd,
        }),
        isError: false,
      });

      // P2: Post-call billing (non-blocking, handles errors internally)
      await recordBilling(
        {
          billingAccountId: caller.billingAccountId,
          virtualKeyId: caller.virtualKeyId,
          requestId,
          model: modelId,
          providerCostUsd: result.providerCostUsd,
          litellmCallId: result.litellmCallId,
          provenance: "stream",
        },
        accountService,
        log
      );

      // P2: Record success telemetry for stream
      const latencyMs = Math.max(0, Math.round(llmEvent.durationMs));
      await recordTelemetry(
        {
          invocationId,
          requestId: ctx.reqId,
          traceId: ctx.traceId,
          fallbackPromptHash: promptHash,
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
      // If stream fails/aborts, we still want to record partial usage if available
      // But for now, we just log and rethrow.
      // Ideally, we'd catch AbortError and record partials if LiteLLM gave us any.
      log.error({ err: error, requestId }, "Stream execution failed");

      // Record error metric
      const errorCode = classifyLlmError(error);
      await recordMetrics({
        model,
        durationMs: performance.now() - llmStart,
        isError: true,
        errorCode,
      });

      // P2: Record error telemetry for stream
      const latencyMs = Math.max(0, Math.round(performance.now() - llmStart));
      const errorKind = error instanceof LlmError ? error.kind : "unknown";
      await recordTelemetry(
        {
          invocationId,
          requestId: ctx.reqId,
          traceId: ctx.traceId,
          fallbackPromptHash: promptHash,
          model,
          latencyMs,
          status: "error",
          errorCode: errorKind,
        },
        aiTelemetry,
        langfuse,
        log
      );

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
