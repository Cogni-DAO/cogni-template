// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/ai/inproc-graph`
 * Purpose: In-process graph executor adapter wrapping existing LLM completion flow.
 * Scope: Implements GraphExecutorPort for direct LLM calls. Does not handle multi-step graphs (P1).
 * Invariants:
 *   - UNIFIED_GRAPH_EXECUTOR: All execution flows through GraphExecutorPort
 *   - GRAPH_LLM_VIA_COMPLETION: Delegates to completion.executeStream for billing/telemetry
 *   - P0_ATTEMPT_FREEZE: attempt is always 0 (no run persistence)
 *   - GRAPH_FINALIZATION_ONCE: Exactly one done event and final resolution per run
 *   - NO_AWAIT_FINAL_IN_LOOP: Must break out of for-await before awaiting final (prevents deadlock)
 * Side-effects: IO (via injected completion function)
 * Links: ports/graph-executor.port.ts, features/ai/services/completion.ts, GRAPH_EXECUTION.md
 * @public
 */

import type { Logger } from "pino";

import type {
  AccountService,
  AiTelemetryPort,
  ChatDeltaEvent,
  Clock,
  GraphExecutorPort,
  GraphFinal,
  GraphRunRequest,
  GraphRunResult,
  LangfusePort,
  LlmService,
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
 */
export interface CompletionStreamResult {
  stream: AsyncIterable<ChatDeltaEvent>;
  final: Promise<CompletionFinalResult>;
}

/**
 * Completion final result shape.
 * Includes toolCalls for agentic graph runners.
 */
export type CompletionFinalResult =
  | {
      ok: true;
      requestId: string;
      usage: { promptTokens: number; completionTokens: number };
      finishReason: string;
      /** Resolved model ID for billing */
      model?: string;
      /** Provider cost in USD */
      providerCostUsd?: number;
      /** LiteLLM call ID for idempotent billing */
      litellmCallId?: string;
      /** Tool calls requested by LLM (when finishReason === "tool_calls") */
      toolCalls?: import("@/ports").LlmToolCall[];
    }
  | {
      ok: false;
      requestId: string;
      error: "timeout" | "aborted" | "internal";
    };

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
  tools?: import("@/ports").LlmToolDefinition[];
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
  tools?: import("@/ports").LlmToolDefinition[];
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
 * Graph runner function signature.
 * Runners implement graph-specific orchestration logic.
 * Defined in adapter to avoid features importing from adapters.
 */
export type GraphRunnerFn = (req: GraphRunRequest) => GraphRunResult;

/**
 * Interface for completion unit execution capability.
 * Used by graph runners to access LLM execution.
 */
export type CompletionUnitExecutor = Pick<
  InProcGraphExecutorAdapter,
  "executeCompletionUnit"
>;

/**
 * Graph resolver function signature.
 * Returns a runner for a given graphName, or undefined for default behavior.
 * Receives adapter reference for runners that need executeCompletionUnit.
 */
export type GraphResolverFn = (
  graphName: string,
  adapter: CompletionUnitExecutor
) => GraphRunnerFn | undefined;

/**
 * In-process graph executor adapter.
 * Wraps existing completion flow behind GraphExecutorPort interface.
 * Routes to graph runners via injected resolver, falls back to default completion.
 */
export class InProcGraphExecutorAdapter implements GraphExecutorPort {
  private readonly log: Logger;

  constructor(
    private readonly deps: InProcGraphExecutorDeps,
    private readonly completionStream: CompletionStreamFn,
    private readonly graphResolver?: GraphResolverFn
  ) {
    this.log = makeLogger({ component: "InProcGraphExecutorAdapter" });
  }

  /**
   * Execute a graph with the given request.
   * Returns immediately with stream handle; execution happens on consumption.
   *
   * Per GRAPH_EXECUTION.md:
   * - P0_ATTEMPT_FREEZE: attempt is always 0
   * - GRAPH_LLM_VIA_COMPLETION: delegates to completion.executeStream
   * - Emits usage_report event before done for billing subscriber
   *
   * Graph routing: If graphResolver is injected and returns a runner for
   * req.graphName, delegates to that runner. Otherwise uses default completion path.
   */
  runGraph(req: GraphRunRequest): GraphRunResult {
    const {
      runId,
      ingressRequestId,
      messages,
      model,
      caller,
      abortSignal,
      graphName,
    } = req;
    const attempt = 0; // P0_ATTEMPT_FREEZE

    this.log.debug(
      { runId, attempt, model, graphName, messageCount: messages.length },
      "InProcGraphExecutorAdapter.runGraph starting"
    );

    // Check for custom graph runner
    if (this.graphResolver && graphName) {
      const runner = this.graphResolver(graphName, this);
      if (runner) {
        this.log.debug(
          { runId, graphName },
          "Delegating to custom graph runner"
        );
        return runner(req);
      }
    }

    // Default: single completion path
    // Create RequestContext for completion layer
    // Per RUNID_IS_CANONICAL: reqId = ingressRequestId (delivery correlation), not runId
    const ctx = this.createRequestContext(ingressRequestId);

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

    const ctx = this.createRequestContext(ingressRequestId);

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

    // Create completion promise lazily
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
   */
  private createRequestContext(ingressRequestId: string): RequestContext {
    return {
      log: this.log.child({ ingressRequestId }),
      reqId: ingressRequestId,
      traceId: this.generateTraceId(),
      routeId: "graph.inproc",
      clock: this.deps.clock,
    };
  }

  /**
   * Generate a trace ID for distributed tracing.
   * Format: 32 hex chars (128 bits) per W3C Trace Context.
   */
  private generateTraceId(): string {
    // Simple random trace ID for P0; production would use OTel SDK
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
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
