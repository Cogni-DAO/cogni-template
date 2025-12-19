// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/ai/services/ai_runtime`
 * Purpose: AI runtime orchestrator that decides graph vs direct LLM and emits AiEvents.
 * Scope: Generates graphRunId for graph executions; returns AsyncIterable<AiEvent> and StreamFinalResult. Does not touch wire protocol encoding.
 * Invariants:
 *   - AI_RUNTIME_EMITS_AIEVENTS: Only emits AiEvents (text_delta for P1; tool events added when graphs land)
 *   - RUNTIME_STREAMS_ASYNC_ITERABLE: Returns AsyncIterable<AiEvent>, no buffering
 *   - Delegates to completion.ts for billing/telemetry (never calls llmService directly)
 *   - Must NOT import app/*, adapters/*, or contracts/*
 *   - Route layer maps AiEvents to assistant-stream format
 * Side-effects: IO (via injected services)
 * Notes: P1 supports direct LLM streaming; graph support added when graphs are implemented
 * Links: ../types.ts, ../tool-runner.ts, completion.ts, AI_SETUP_SPEC.md
 * @public
 */

import { randomUUID } from "node:crypto";

import type { Message } from "@/core";
import type {
  AccountService,
  AiTelemetryPort,
  ChatDeltaEvent,
  Clock,
  LangfusePort,
  LlmCaller,
  LlmService,
} from "@/ports";
import type { RequestContext } from "@/shared/observability";
import type { AiEvent, StreamFinalResult, TextDeltaEvent } from "../types";
import { executeStream } from "./completion";

/**
 * Input for AI runtime operations.
 */
export interface AiRuntimeInput {
  /** Conversation messages */
  readonly messages: Message[];
  /** Model identifier */
  readonly model: string;
  /** Caller info for billing and telemetry */
  readonly caller: LlmCaller;
  /** Abort signal for cancellation */
  readonly abortSignal?: AbortSignal;
}

/**
 * Dependencies for AI runtime.
 * Injected at construction to enable testing and DI.
 * Includes all deps needed to delegate to executeStream().
 */
export interface AiRuntimeDeps {
  readonly llmService: LlmService;
  readonly accountService: AccountService;
  readonly clock: Clock;
  readonly aiTelemetry: AiTelemetryPort;
  readonly langfuse: LangfusePort | undefined;
}

/**
 * AI runtime result with stream and completion promise.
 */
export interface AiRuntimeResult {
  /** Stream of AI events for real-time rendering */
  readonly stream: AsyncIterable<AiEvent>;
  /** Promise resolving with final result (ok with usage/finishReason, or error) */
  readonly final: Promise<StreamFinalResult>;
}

/**
 * Create an AI runtime instance with injected dependencies.
 * Entry point for AI chat streaming with graph vs direct LLM decision.
 *
 * @param deps - Injected service dependencies
 * @returns Runtime with runChatStream method
 */
export function createAiRuntime(deps: AiRuntimeDeps) {
  const { llmService, accountService, clock, aiTelemetry, langfuse } = deps;

  /**
   * Run a chat stream as AiEvents.
   * Delegates to executeStream() for billing/telemetry, then transforms to AiEvents.
   * P1: Direct LLM path only. Graph support in future.
   *
   * Per RUNTIME_STREAMS_ASYNC_ITERABLE: Returns immediately, streams via AsyncIterable.
   * Per AI_RUNTIME_EMITS_AIEVENTS: Only emits text_delta (P1); tool events when graphs land.
   *
   * @param input - Chat input (messages, model, caller)
   * @param ctx - Request context for logging/telemetry
   * @returns Stream of AiEvents and completion promise
   */
  async function runChatStream(
    input: AiRuntimeInput,
    ctx: RequestContext
  ): Promise<AiRuntimeResult> {
    const { messages, model, caller, abortSignal } = input;

    // P1: Direct LLM path only
    // Future: Check if this request should use a graph, generate graphRunId if so

    // Delegate to executeStream for billing, telemetry, credit checks
    // Never call llmService directly from this layer
    const { stream: deltaStream, final: completionFinal } = await executeStream(
      {
        messages,
        model,
        llmService,
        accountService,
        clock,
        caller,
        ctx,
        aiTelemetry,
        langfuse,
        ...(abortSignal ? { abortSignal } : {}),
      }
    );

    // Transform ChatDeltaEvents to AiEvents
    const aiEventStream = transformToAiEvents(deltaStream);

    // Pass through final result unchanged (discriminated union with usage/finishReason)
    return {
      stream: aiEventStream,
      final: completionFinal,
    };
  }

  /**
   * Generate a graph run ID for graph executions.
   * Per AI_SETUP_SPEC.md: Runtime is sole owner of graphRunId generation.
   *
   * @returns Unique graph run ID
   */
  function generateGraphRunId(): string {
    return randomUUID();
  }

  return {
    runChatStream,
    generateGraphRunId,
  };
}

/**
 * Transform LLM ChatDeltaEvents to AiEvents.
 * Maps port-level events to feature-level AI events.
 */
async function* transformToAiEvents(
  deltaStream: AsyncIterable<ChatDeltaEvent>
): AsyncIterable<AiEvent> {
  for await (const event of deltaStream) {
    switch (event.type) {
      case "text_delta": {
        const textEvent: TextDeltaEvent = {
          type: "text_delta",
          delta: event.delta,
        };
        yield textEvent;
        break;
      }
      case "error":
        // Log error but don't emit to UI - the stream will complete with error
        // Errors are handled at route level
        break;
      case "done":
        // End generator - route will emit FinishMessage using data from final
        return;
    }
  }
}

/**
 * Type for the AI runtime instance.
 */
export type AiRuntime = ReturnType<typeof createAiRuntime>;
