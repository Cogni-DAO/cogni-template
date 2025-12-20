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
import { isModelFree } from "@/shared/ai/model-catalog.server";
import { serverEnv } from "@/shared/env";
import {
  type AiLlmCallEvent,
  classifyLlmError,
  type RequestContext,
} from "@/shared/observability";
import { calculateDefaultLlmCharge } from "./llmPricingPolicy";
import { prepareMessages } from "./message-preparation";
import { recordMetrics } from "./metrics";
import { validateCreditsUpperBound } from "./preflight-credit-check";

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

    // Per AI_SETUP_SPEC.md: Record telemetry on error path with REAL prompt_hash
    // latencyMs must be integer for DB schema (milliseconds precision sufficient)
    const latencyMs = Math.max(0, Math.round(performance.now() - llmStart));
    const errorKind = error instanceof LlmError ? error.kind : "unknown";

    // Create Langfuse trace first to capture langfuseTraceId for DB record
    let langfuseTraceId: string | undefined;
    if (langfuse) {
      try {
        langfuseTraceId = await langfuse.createTrace(ctx.traceId, {
          requestId: ctx.reqId,
          model,
          promptHash, // Real hash
        });
        langfuse.recordGeneration(ctx.traceId, {
          model,
          status: "error",
          errorCode: errorKind,
          latencyMs,
        });
        // Flush in background (never await on request path per spec)
        langfuse
          .flush()
          .catch((err) => log.warn({ err }, "Langfuse flush failed"));
      } catch {
        // Langfuse failure shouldn't block request - DB telemetry still written
        langfuseTraceId = undefined;
      }
    }

    try {
      await aiTelemetry.recordInvocation({
        invocationId,
        requestId: ctx.reqId,
        traceId: ctx.traceId,
        ...(langfuseTraceId ? { langfuseTraceId } : {}),
        provider: "unknown", // Not available on error (no response)
        model,
        promptHash, // Real hash computed BEFORE LLM call
        routerPolicyVersion: serverEnv().ROUTER_POLICY_VERSION, // Current version
        status: "error",
        errorCode: errorKind,
        latencyMs,
      });
    } catch (telemetryError) {
      // Telemetry should never block error propagation
      log.error(
        { err: telemetryError, invocationId },
        "Failed to record error telemetry"
      );
    }

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

  // Post-call billing: Calculate charged credits and record receipt
  // Per ACTIVITY_METRICS.md: post-call is NEVER blocking
  try {
    const isFree = await isModelFree(modelId);
    let chargedCredits = 0n;

    // DEBUG: Log cost data received from LiteLLM
    log.debug(
      {
        requestId,
        modelId,
        isFree,
        providerCostUsd: result.providerCostUsd,
        litellmCallId: result.litellmCallId,
        tokensUsed: result.usage?.totalTokens,
      },
      "Post-call billing: LiteLLM response data"
    );

    let userCostUsd: number | null = null;

    if (!isFree && typeof result.providerCostUsd === "number") {
      // Use policy function for consistent calculation
      const charge = calculateDefaultLlmCharge(result.providerCostUsd);
      chargedCredits = charge.chargedCredits;
      userCostUsd = charge.userCostUsd;

      log.debug(
        {
          requestId,
          providerCostUsd: result.providerCostUsd,
          userCostUsd,
          chargedCredits: chargedCredits.toString(),
        },
        "Cost calculation complete"
      );
    } else if (!isFree && typeof result.providerCostUsd !== "number") {
      // CRITICAL: Non-free model but no cost data (degraded billing)
      log.error(
        {
          requestId,
          modelId,
          litellmCallId: result.litellmCallId,
          isFree,
        },
        "CRITICAL: LiteLLM response missing cost data - billing incomplete (degraded under-billing mode)"
      );
    }
    // If no cost available or free model: chargedCredits stays 0n

    // INVARIANT: Always record charge receipt for billed calls
    // sourceReference: litellmCallId (happy path) or requestId (forensic fallback)
    const sourceReference = result.litellmCallId ?? requestId;
    if (!result.litellmCallId) {
      log.error(
        { requestId, modelId, isFree },
        "BUG: LiteLLM response missing call ID - recording charge_receipt without joinable usage reference"
      );
    }

    await accountService.recordChargeReceipt({
      billingAccountId: caller.billingAccountId,
      virtualKeyId: caller.virtualKeyId,
      requestId,
      chargedCredits,
      responseCostUsd: userCostUsd,
      litellmCallId: result.litellmCallId ?? null,
      provenance: "response",
      chargeReason: "llm_usage",
      sourceSystem: "litellm",
      sourceReference,
    });
  } catch (error) {
    // Post-call billing is best-effort - NEVER block user response
    // recordChargeReceipt should never throw InsufficientCreditsPortError per design
    log.error(
      {
        err: error,
        requestId,
        billingAccountId: caller.billingAccountId,
      },
      "CRITICAL: Post-call billing failed - user response NOT blocked"
    );
    // DO NOT RETHROW - user already got LLM response, must see it
    // EXCEPT in test environment where we need to catch these issues
    if (serverEnv().APP_ENV === "test") {
      throw error;
    }
  }

  // Per AI_SETUP_SPEC.md: Record success telemetry
  // Prefer adapter's promptHash (canonical payload hash) when available; fall back to pre-computed
  // latencyMs must be integer for DB schema (milliseconds precision sufficient)
  const latencyMs = Math.max(0, Math.round(llmEvent.durationMs));
  const resolvedPromptHash = result.promptHash ?? promptHash;

  // Create Langfuse trace first to capture langfuseTraceId for DB record
  let langfuseTraceId: string | undefined;
  if (langfuse) {
    try {
      langfuseTraceId = await langfuse.createTrace(ctx.traceId, {
        requestId: ctx.reqId,
        model: result.resolvedModel ?? modelId,
        promptHash: resolvedPromptHash,
      });
      langfuse.recordGeneration(ctx.traceId, {
        model: result.resolvedModel ?? modelId,
        status: "success",
        latencyMs,
        ...(result.usage?.promptTokens !== undefined
          ? { tokensIn: result.usage.promptTokens }
          : {}),
        ...(result.usage?.completionTokens !== undefined
          ? { tokensOut: result.usage.completionTokens }
          : {}),
        ...(result.providerCostUsd !== undefined
          ? { providerCostUsd: result.providerCostUsd }
          : {}),
      });
      // Flush in background (never await on request path per spec)
      langfuse
        .flush()
        .catch((err) => log.warn({ err }, "Langfuse flush failed"));
    } catch {
      // Langfuse failure shouldn't block request - DB telemetry still written
      langfuseTraceId = undefined;
    }
  }

  try {
    await aiTelemetry.recordInvocation({
      invocationId,
      requestId: ctx.reqId,
      traceId: ctx.traceId,
      ...(langfuseTraceId ? { langfuseTraceId } : {}),
      provider: result.resolvedProvider ?? "unknown",
      model: result.resolvedModel ?? modelId,
      promptHash: resolvedPromptHash, // Prefer adapter's canonical hash
      routerPolicyVersion: serverEnv().ROUTER_POLICY_VERSION, // Current version
      status: "success",
      latencyMs,
      ...(result.usage?.promptTokens !== undefined
        ? { tokensIn: result.usage.promptTokens }
        : {}),
      ...(result.usage?.completionTokens !== undefined
        ? { tokensOut: result.usage.completionTokens }
        : {}),
      ...(result.usage?.totalTokens !== undefined
        ? { tokensTotal: result.usage.totalTokens }
        : {}),
      ...(result.providerCostUsd !== undefined
        ? { providerCostUsd: result.providerCostUsd }
        : {}),
      ...(result.litellmCallId ? { litellmCallId: result.litellmCallId } : {}),
    });
  } catch (telemetryError) {
    // Telemetry should never block user response
    log.error(
      { err: telemetryError, invocationId },
      "Failed to record success telemetry"
    );
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

      // Post-call billing: Calculate charged credits and record receipt
      // Per ACTIVITY_METRICS.md: post-call is NEVER blocking
      try {
        const isFree = await isModelFree(modelId);
        let chargedCredits = 0n;
        let userCostUsd: number | null = null;

        if (!isFree && typeof result.providerCostUsd === "number") {
          // Use policy function for consistent calculation
          const charge = calculateDefaultLlmCharge(result.providerCostUsd);
          chargedCredits = charge.chargedCredits;
          userCostUsd = charge.userCostUsd;

          log.debug(
            {
              requestId,
              providerCostUsd: result.providerCostUsd,
              userCostUsd,
              chargedCredits: chargedCredits.toString(),
            },
            "Stream cost calculation complete"
          );
        }
        // If no cost available or free model: chargedCredits stays 0n

        // INVARIANT: Always record charge receipt for billed calls
        // sourceReference: litellmCallId (happy path) or requestId (forensic fallback)
        const sourceReference = result.litellmCallId ?? requestId;
        if (!result.litellmCallId) {
          log.error(
            { requestId, modelId: model, isFree },
            "BUG: LiteLLM response missing call ID - recording charge_receipt without joinable usage reference"
          );
        }

        await accountService.recordChargeReceipt({
          billingAccountId: caller.billingAccountId,
          virtualKeyId: caller.virtualKeyId,
          requestId,
          chargedCredits,
          responseCostUsd: userCostUsd,
          litellmCallId: result.litellmCallId ?? null,
          provenance: "stream",
          chargeReason: "llm_usage",
          sourceSystem: "litellm",
          sourceReference,
        });
      } catch (error) {
        // Post-call billing is best-effort - NEVER block user response
        log.error(
          {
            err: error,
            requestId,
            billingAccountId: caller.billingAccountId,
          },
          "CRITICAL: Post-stream billing failed"
        );
        if (serverEnv().APP_ENV === "test") throw error;
      }

      // Per AI_SETUP_SPEC.md: Record success telemetry for stream
      // Prefer adapter's promptHash (canonical payload hash) when available; fall back to pre-computed
      // latencyMs must be integer for DB schema (milliseconds precision sufficient)
      const latencyMs = Math.max(0, Math.round(llmEvent.durationMs));
      const resolvedPromptHash = result.promptHash ?? promptHash;

      // Create Langfuse trace first to capture langfuseTraceId for DB record
      let langfuseTraceId: string | undefined;
      if (langfuse) {
        try {
          langfuseTraceId = await langfuse.createTrace(ctx.traceId, {
            requestId: ctx.reqId,
            model: result.resolvedModel ?? modelId,
            promptHash: resolvedPromptHash,
          });
          langfuse.recordGeneration(ctx.traceId, {
            model: result.resolvedModel ?? modelId,
            status: "success",
            latencyMs,
            ...(result.usage?.promptTokens !== undefined
              ? { tokensIn: result.usage.promptTokens }
              : {}),
            ...(result.usage?.completionTokens !== undefined
              ? { tokensOut: result.usage.completionTokens }
              : {}),
            ...(result.providerCostUsd !== undefined
              ? { providerCostUsd: result.providerCostUsd }
              : {}),
          });
          // Flush in background (never await on request path per spec)
          langfuse
            .flush()
            .catch((err) => log.warn({ err }, "Langfuse flush failed"));
        } catch {
          // Langfuse failure shouldn't block request - DB telemetry still written
          langfuseTraceId = undefined;
        }
      }

      try {
        await aiTelemetry.recordInvocation({
          invocationId,
          requestId: ctx.reqId,
          traceId: ctx.traceId,
          ...(langfuseTraceId ? { langfuseTraceId } : {}),
          provider: result.resolvedProvider ?? "unknown",
          model: result.resolvedModel ?? modelId,
          promptHash: resolvedPromptHash, // Prefer adapter's canonical hash
          routerPolicyVersion: serverEnv().ROUTER_POLICY_VERSION,
          status: "success",
          latencyMs,
          ...(result.usage?.promptTokens !== undefined
            ? { tokensIn: result.usage.promptTokens }
            : {}),
          ...(result.usage?.completionTokens !== undefined
            ? { tokensOut: result.usage.completionTokens }
            : {}),
          ...(result.usage?.totalTokens !== undefined
            ? { tokensTotal: result.usage.totalTokens }
            : {}),
          ...(result.providerCostUsd !== undefined
            ? { providerCostUsd: result.providerCostUsd }
            : {}),
          ...(result.litellmCallId
            ? { litellmCallId: result.litellmCallId }
            : {}),
        });
      } catch (telemetryError) {
        // Telemetry should never block user response
        log.error(
          { err: telemetryError, invocationId },
          "Failed to record stream success telemetry"
        );
      }

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

      // Per AI_SETUP_SPEC.md: Record error telemetry for stream with REAL prompt_hash
      // latencyMs must be integer for DB schema (milliseconds precision sufficient)
      const latencyMs = Math.max(0, Math.round(performance.now() - llmStart));
      const errorKind = error instanceof LlmError ? error.kind : "unknown";

      // Create Langfuse trace first to capture langfuseTraceId for DB record
      let langfuseTraceId: string | undefined;
      if (langfuse) {
        try {
          langfuseTraceId = await langfuse.createTrace(ctx.traceId, {
            requestId: ctx.reqId,
            model,
            promptHash, // Real hash
          });
          langfuse.recordGeneration(ctx.traceId, {
            model,
            status: "error",
            errorCode: errorKind,
            latencyMs,
          });
          // Flush in background (never await on request path per spec)
          langfuse
            .flush()
            .catch((err) => log.warn({ err }, "Langfuse flush failed"));
        } catch {
          // Langfuse failure shouldn't block request - DB telemetry still written
          langfuseTraceId = undefined;
        }
      }

      try {
        await aiTelemetry.recordInvocation({
          invocationId,
          requestId: ctx.reqId,
          traceId: ctx.traceId,
          ...(langfuseTraceId ? { langfuseTraceId } : {}),
          provider: "unknown",
          model,
          promptHash, // Real hash computed BEFORE LLM call
          routerPolicyVersion: serverEnv().ROUTER_POLICY_VERSION,
          status: "error",
          errorCode: errorKind,
          latencyMs,
        });
      } catch (telemetryError) {
        // Telemetry should never block error propagation
        log.error(
          { err: telemetryError, invocationId },
          "Failed to record stream error telemetry"
        );
      }

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
