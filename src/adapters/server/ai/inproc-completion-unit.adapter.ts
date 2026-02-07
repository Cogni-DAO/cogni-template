// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/ai/inproc-completion-unit`
 * Purpose: Adapter used by graph providers to execute completion units with app billing/telemetry.
 * Scope: Provides executeCompletionUnit() for LangGraphInProcProvider. Does NOT implement GraphExecutorPort. Does NOT import @langchain/*.
 * Invariants:
 *   - COMPLETION_UNIT_NOT_PORT: This is a CompletionUnitAdapter, not GraphExecutorPort
 *   - GRAPH_LLM_VIA_COMPLETION: Delegates to completion.executeStream for billing/telemetry
 *   - P0_ATTEMPT_FREEZE: attempt is always 0 (no run persistence)
 *   - NO_AWAIT_FINAL_IN_LOOP: Must break out of for-await before awaiting final (prevents deadlock)
 * Side-effects: IO (via injected completion function)
 * Links: AGENT_DISCOVERY.md, GRAPH_EXECUTION.md, features/ai/services/completion.ts
 * @public
 */

import type { GraphId } from "@cogni/ai-core";
import type { Logger } from "pino";
import {
  type AccountService,
  type AiTelemetryPort,
  type ChatDeltaEvent,
  type Clock,
  type CompletionFinalResult,
  type GraphRunRequest,
  isInsufficientCreditsPortError,
  type LangfusePort,
  type LlmService,
} from "@/ports";
import type { RequestContext } from "@/shared/observability";
import { makeLogger } from "@/shared/observability";
import type {
  AiEvent,
  TextDeltaEvent,
  UsageReportEvent,
} from "@/types/ai-events";
import type { UsageFact } from "@/types/usage";

/**
 * Dependencies for InProcCompletionUnitAdapter.
 * All required for delegation to completion.executeStream.
 */
export interface InProcCompletionUnitDeps {
  readonly llmService: LlmService;
  readonly accountService: AccountService;
  readonly clock: Clock;
  readonly aiTelemetry: AiTelemetryPort;
  readonly langfuse: LangfusePort | undefined;
}

/**
 * Completion stream result shape.
 * Includes billing fields for adapter to emit usage_report.
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
    graphId: GraphId;
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
 * In-process completion unit adapter.
 *
 * Per COMPLETION_UNIT_NOT_PORT: This is a CompletionUnitAdapter, NOT a GraphExecutorPort.
 * Provides executeCompletionUnit() for LangGraphInProcProvider and other graph providers.
 *
 * Per PROVIDER_AGGREGATION: Graph routing is handled by AggregatingGraphExecutor.
 * This adapter provides the completion unit execution that providers use internally.
 */
export class InProcCompletionUnitAdapter {
  private readonly log: Logger;

  constructor(
    private readonly deps: InProcCompletionUnitDeps,
    private readonly completionStream: CompletionStreamFn
  ) {
    this.log = makeLogger({ component: "InProcCompletionUnitAdapter" });
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
    const { runId, attempt, ingressRequestId, graphId } = runContext;

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
      "InProcCompletionUnitAdapter.executeCompletionUnit"
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
      graphId,
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
      graphId: GraphId;
    }
  ): AsyncIterable<AiEvent> {
    const { runId, attempt, caller, graphId } = runContext;
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
      // CRITICAL: Missing litellmCallId is a BUG - fail the run deterministically
      if (!result.litellmCallId) {
        this.log.error(
          { runId, model: result.model },
          "CRITICAL: LiteLLM response missing call ID - billing incomplete, failing run"
        );
        // Throw to propagate error to final (fail run, prevent silent under-billing)
        throw new Error(
          "Billing failed: LiteLLM response missing call ID (x-litellm-call-id)"
        );
      }

      const fact: UsageFact = {
        runId,
        attempt,
        source: "litellm",
        executorType: "inproc",
        billingAccountId: caller.billingAccountId,
        virtualKeyId: caller.virtualKeyId,
        graphId, // For per-agent analytics
        inputTokens: result.usage.promptTokens,
        outputTokens: result.usage.completionTokens,
        usageUnitId: result.litellmCallId, // Required, no fallback
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
}
