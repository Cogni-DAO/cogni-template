// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/ai/inproc-graph`
 * Purpose: In-process graph executor adapter providing completion units for graph providers.
 * Scope: Provides executeCompletionUnit() for LangGraphInProcProvider. Also implements GraphExecutorPort for default completion path. Does NOT import @langchain/*.
 * Invariants:
 *   - GRAPH_LLM_VIA_COMPLETION: Delegates to completion.executeStream for billing/telemetry
 *   - P0_ATTEMPT_FREEZE: attempt is always 0 (no run persistence)
 *   - GRAPH_FINALIZATION_ONCE: Exactly one done event and final resolution per run
 *   - NO_AWAIT_FINAL_IN_LOOP: Must break out of for-await before awaiting final (prevents deadlock)
 * Side-effects: IO (via injected completion function)
 * Links: ports/graph-executor.port.ts, features/ai/services/completion.ts, GRAPH_EXECUTION.md
 * @public
 */

import type { Logger } from "pino";

import {
  type AccountService,
  type AiTelemetryPort,
  type ChatDeltaEvent,
  type Clock,
  type CompletionFinalResult,
  type GraphExecutorPort,
  type GraphFinal,
  type GraphRunRequest,
  type GraphRunResult,
  isInsufficientCreditsPortError,
  type LangfusePort,
  type LlmService,
} from "@/ports";
import type { RequestContext } from "@/shared/observability";
import { makeLogger } from "@/shared/observability";
import type {
  AiEvent,
  DoneEvent,
  TextDeltaEvent,
  UsageReportEvent,
} from "@/types/ai-events";
import type { UsageFact } from "@/types/usage";

/**
 * Dependencies for InProcGraphExecutorAdapter.
 * All required for delegation to completion.executeStream.
 */
export interface InProcGraphExecutorDeps {
  readonly llmService: LlmService;
  readonly accountService: AccountService;
  readonly clock: Clock;
  readonly aiTelemetry: AiTelemetryPort;
  readonly langfuse: LangfusePort | undefined;
}

/**
 * Completion stream result shape.
 * Includes billing fields for GraphExecutorAdapter to emit usage_report.
 * Uses CompletionFinalResult from ports (canonical discriminated union).
 */
export interface CompletionStreamResult {
  stream: AsyncIterable<ChatDeltaEvent>;
  final: Promise<CompletionFinalResult>;
}

/**
 * Completion stream parameters.
 */
export interface CompletionStreamParams {
  messages: GraphRunRequest["messages"];
  model: string;
  llmService: LlmService;
  accountService: AccountService;
  clock: Clock;
  caller: GraphRunRequest["caller"];
  ctx: RequestContext;
  aiTelemetry: AiTelemetryPort;
  langfuse: LangfusePort | undefined;
  abortSignal?: AbortSignal;
  /** Tool definitions for LLM (optional) */
  tools?: readonly import("@/ports").LlmToolDefinition[];
  /** Tool choice for LLM (optional) */
  toolChoice?: import("@/ports").LlmToolChoice;
}

/**
 * Parameters for a single completion unit execution.
 * Used by graph runners that need multiple LLM calls.
 */
export interface CompletionUnitParams {
  messages: GraphRunRequest["messages"];
  model: string;
  caller: GraphRunRequest["caller"];
  runContext: {
    runId: string;
    attempt: number;
    ingressRequestId: string;
  };
  abortSignal?: AbortSignal;
  tools?: readonly import("@/ports").LlmToolDefinition[];
  toolChoice?: import("@/ports").LlmToolChoice;
}

/**
 * Result from a single completion unit execution.
 * Stream includes text_delta + usage_report but NOT done.
 */
export interface CompletionUnitResult {
  /** Stream of AiEvents (text_delta, usage_report) - NO done event */
  stream: AsyncIterable<AiEvent>;
  /** Final result including toolCalls */
  final: Promise<CompletionFinalResult>;
}

/**
 * Completion function signature matching executeStream.
 * Defined here to avoid importing from features layer.
 */
export type CompletionStreamFn = (
  params: CompletionStreamParams
) => Promise<CompletionStreamResult>;

/**
 * In-process graph executor adapter.
 *
 * Primary purpose: Provides executeCompletionUnit() for LangGraphInProcProvider.
 * Secondary: Implements GraphExecutorPort.runGraph() for default completion path.
 *
 * Per PROVIDER_AGGREGATION: Graph routing is handled by AggregatingGraphExecutor.
 * This adapter no longer does graph routing — providers use executeCompletionUnit directly.
 */
export class InProcGraphExecutorAdapter implements GraphExecutorPort {
  private readonly log: Logger;

  constructor(
    private readonly deps: InProcGraphExecutorDeps,
    private readonly completionStream: CompletionStreamFn
  ) {
    this.log = makeLogger({ component: "InProcGraphExecutorAdapter" });
  }

  /**
   * Execute a graph with the given request.
   * Returns immediately with stream handle; execution happens on consumption.
   *
   * NOTE: This method provides a simple single-completion path.
   * For multi-step graph execution, use LangGraphInProcProvider instead.
   *
   * Per GRAPH_EXECUTION.md:
   * - P0_ATTEMPT_FREEZE: attempt is always 0
   * - GRAPH_LLM_VIA_COMPLETION: delegates to completion.executeStream
   * - Emits usage_report event before done for billing subscriber
   */
  runGraph(req: GraphRunRequest): GraphRunResult {
    const { runId, ingressRequestId, messages, model, caller, abortSignal } =
      req;
    const attempt = 0; // P0_ATTEMPT_FREEZE

    this.log.debug(
      { runId, attempt, model, messageCount: messages.length },
      "InProcGraphExecutorAdapter.runGraph starting (default completion path)"
    );

    // Default: single completion path
    // Create RequestContext for completion layer
    // Per RUNID_IS_CANONICAL: reqId = ingressRequestId (delivery correlation), not runId
    // Per GENERATION_UNDER_EXISTING_TRACE: use caller.traceId for Langfuse correlation
    const ctx = this.createRequestContext(ingressRequestId, caller.traceId);

    // Start completion asynchronously
    // The completion promise is created lazily when the stream is consumed
    const completionPromiseHolder: {
      promise?: ReturnType<CompletionStreamFn>;
    } = {};

    const getCompletionPromise = async () => {
      if (!completionPromiseHolder.promise) {
        completionPromiseHolder.promise = this.completionStream({
          messages,
          model,
          llmService: this.deps.llmService,
          accountService: this.deps.accountService,
          clock: this.deps.clock,
          caller,
          ctx,
          aiTelemetry: this.deps.aiTelemetry,
          langfuse: this.deps.langfuse,
          ...(abortSignal && { abortSignal }),
        });
      }
      return completionPromiseHolder.promise;
    };

    // Create transformed stream (lazy execution)
    // Pass run context for building UsageFact in usage_report event
    const stream = this.createTransformedStream(getCompletionPromise, {
      runId,
      attempt,
      caller,
    });

    // Create wrapped final promise
    const final = this.createFinalPromise(getCompletionPromise, runId);

    return { stream, final };
  }

  /**
   * Execute a single completion unit (LLM call) for use by graph runners.
   * Transforms stream, emits usage_report, but does NOT emit done.
   * Used by multi-step graph runners that need multiple LLM calls.
   *
   * Per GRAPH_LLM_VIA_COMPLETION: this is the shared in-proc execution engine.
   * Runners orchestrate; this method handles transformation + billing events.
   */
  executeCompletionUnit(params: CompletionUnitParams): CompletionUnitResult {
    const {
      messages,
      model,
      caller,
      runContext,
      abortSignal,
      tools,
      toolChoice,
    } = params;
    const { runId, attempt, ingressRequestId } = runContext;

    // Per GENERATION_UNDER_EXISTING_TRACE: use caller.traceId for Langfuse correlation
    const ctx = this.createRequestContext(ingressRequestId, caller.traceId);

    this.log.debug(
      {
        runId,
        attempt,
        model,
        messageCount: messages.length,
        hasTools: !!tools,
      },
      "InProcGraphExecutorAdapter.executeCompletionUnit"
    );

    // Create completion promise lazily, with error classification at the boundary.
    // Per structural fix: classify InsufficientCreditsPortError while still typed,
    // then propagate as errorCode data instead of letting it become "internal".
    const completionPromiseHolder: {
      promise?: ReturnType<CompletionStreamFn>;
    } = {};

    const getCompletionPromise = async () => {
      if (!completionPromiseHolder.promise) {
        completionPromiseHolder.promise = this.completionStream({
          messages,
          model,
          llmService: this.deps.llmService,
          accountService: this.deps.accountService,
          clock: this.deps.clock,
          caller,
          ctx,
          aiTelemetry: this.deps.aiTelemetry,
          langfuse: this.deps.langfuse,
          ...(abortSignal && { abortSignal }),
          ...(tools && { tools }),
          ...(toolChoice && { toolChoice }),
        }).catch((error: unknown) => {
          // Classify at typed boundary: convert InsufficientCreditsPortError to typed result
          if (isInsufficientCreditsPortError(error)) {
            this.log.debug(
              { runId, billingAccountId: caller.billingAccountId },
              "Insufficient credits - returning typed error result"
            );
            // Return typed error result instead of throwing
            const errorStream = (async function* () {
              // Empty stream - error is in final
            })();
            const errorFinal: Promise<CompletionFinalResult> = Promise.resolve({
              ok: false as const,
              requestId: ingressRequestId,
              error: "insufficient_credits" as const,
            });
            return { stream: errorStream, final: errorFinal };
          }
          throw error;
        });
      }
      return completionPromiseHolder.promise;
    };

    // Create stream WITHOUT done (for multi-step runners)
    const stream = this.createCompletionUnitStream(getCompletionPromise, {
      runId,
      attempt,
      caller,
    });

    // Final promise with toolCalls
    const final = this.createCompletionUnitFinal(getCompletionPromise);

    return { stream, final };
  }

  /**
   * Create stream for completion unit - text_delta + usage_report, NO done.
   */
  private async *createCompletionUnitStream(
    getCompletionPromise: () => Promise<
      Awaited<ReturnType<CompletionStreamFn>>
    >,
    runContext: {
      runId: string;
      attempt: number;
      caller: GraphRunRequest["caller"];
    }
  ): AsyncIterable<AiEvent> {
    const { runId, attempt, caller } = runContext;
    const completionResult = await getCompletionPromise();
    const { stream, final } = completionResult;

    // Stream text deltas
    let sawDone = false;
    for await (const event of stream) {
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
          this.log.warn({ runId, error: event }, "Stream error event");
          break;
        case "done":
          sawDone = true;
          break;
      }
      if (sawDone) break;
    }

    // Emit usage_report (but NOT done - caller handles that)
    const result = await final;
    if (result.ok) {
      const fact: UsageFact = {
        runId,
        attempt,
        source: "litellm",
        executorType: "inproc",
        billingAccountId: caller.billingAccountId,
        virtualKeyId: caller.virtualKeyId,
        inputTokens: result.usage.promptTokens,
        outputTokens: result.usage.completionTokens,
        ...(result.litellmCallId && { usageUnitId: result.litellmCallId }),
        ...(result.model && { model: result.model }),
        ...(result.providerCostUsd !== undefined && {
          costUsd: result.providerCostUsd,
        }),
      };
      const usageEvent: UsageReportEvent = { type: "usage_report", fact };
      yield usageEvent;
    }
    // NO done event - caller emits done when all iterations complete
  }

  /**
   * Create final promise for completion unit - includes toolCalls.
   */
  private async createCompletionUnitFinal(
    getCompletionPromise: () => Promise<Awaited<ReturnType<CompletionStreamFn>>>
  ): Promise<CompletionFinalResult> {
    const { final } = await getCompletionPromise();
    return final;
  }

  /**
   * Create RequestContext for completion layer.
   * Uses ingressRequestId as reqId (delivery-layer correlation).
   * Uses caller's traceId for Langfuse correlation (GENERATION_UNDER_EXISTING_TRACE).
   */
  private createRequestContext(
    ingressRequestId: string,
    traceId: string
  ): RequestContext {
    return {
      log: this.log.child({ ingressRequestId }),
      reqId: ingressRequestId,
      traceId, // Use caller's traceId for Langfuse correlation
      routeId: "graph.inproc",
      clock: this.deps.clock,
    };
  }

  /**
   * Transform ChatDeltaEvents to AiEvents.
   * Emits usage_report before done per GRAPH_EXECUTION.md billing flow.
   * Per GRAPH_FINALIZATION_ONCE: exactly one done event per run.
   */
  private async *createTransformedStream(
    getCompletionPromise: () => Promise<
      Awaited<ReturnType<CompletionStreamFn>>
    >,
    runContext: {
      runId: string;
      attempt: number;
      caller: GraphRunRequest["caller"];
    }
  ): AsyncIterable<AiEvent> {
    const { runId, attempt, caller } = runContext;
    const completionResult = await getCompletionPromise();
    const { stream, final } = completionResult;

    // CRITICAL: Do NOT await final inside this loop - causes deadlock.
    // LiteLLM's final resolves in its finally block, which only runs when
    // the iterator closes. Break out of loop first, then await final.
    let sawDone = false;

    for await (const event of stream) {
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
          // Errors handled via final promise, not stream events
          this.log.warn({ runId, error: event }, "Stream error event");
          break;
        case "done":
          sawDone = true;
          break;
      }
      if (sawDone) break;
    }

    // Finalize: await final (now safe - iterator closed), emit usage_report + done
    const result = await final;
    if (result.ok) {
      const fact: UsageFact = {
        runId,
        attempt,
        source: "litellm",
        executorType: "inproc",
        billingAccountId: caller.billingAccountId,
        virtualKeyId: caller.virtualKeyId,
        inputTokens: result.usage.promptTokens,
        outputTokens: result.usage.completionTokens,
        // Optional fields: only include when defined (exactOptionalPropertyTypes)
        ...(result.litellmCallId && { usageUnitId: result.litellmCallId }),
        ...(result.model && { model: result.model }),
        ...(result.providerCostUsd !== undefined && {
          costUsd: result.providerCostUsd,
        }),
      };
      const usageEvent: UsageReportEvent = { type: "usage_report", fact };
      yield usageEvent;
    }
    const doneEvent: DoneEvent = { type: "done" };
    yield doneEvent;
  }

  /**
   * Wrap completion final promise to GraphFinal format.
   */
  private async createFinalPromise(
    getCompletionPromise: () => Promise<
      Awaited<ReturnType<CompletionStreamFn>>
    >,
    runId: string
  ): Promise<GraphFinal> {
    const { final } = await getCompletionPromise();
    const result = await final;

    if (result.ok) {
      return {
        ok: true,
        runId,
        requestId: result.requestId,
        usage: {
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
        },
        finishReason: result.finishReason,
        ...(result.content && { content: result.content }),
      };
    }

    return {
      ok: false,
      runId,
      requestId: result.requestId,
      error: result.error,
    };
  }
}
