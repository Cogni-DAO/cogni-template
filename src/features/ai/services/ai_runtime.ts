// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/ai/services/ai_runtime`
 * Purpose: AI runtime orchestrator using GraphExecutorPort with run-centric billing.
 * Scope: Generates runId, calls graphExecutor.runGraph(), pumps stream via RunEventRelay. Does not touch wire protocol encoding.
 * Invariants:
 *   - UNIFIED_GRAPH_EXECUTOR: All execution via GraphExecutorPort.runGraph()
 *   - BILLING_INDEPENDENT_OF_CLIENT: RunEventRelay pumps to completion; UI disconnect doesn't stop billing
 *   - AI_RUNTIME_EMITS_AIEVENTS: Only emits AiEvents (text_delta, tool_call_*, done/error); usage_report filtered out
 *   - PROTOCOL_TERMINATION: uiStream terminates on done/error events, not pumpDone (prevents hang)
 *   - Must NOT import app/*, adapters/*, or contracts/*
 * Side-effects: IO (via injected services)
 * Notes: Per GRAPH_EXECUTION.md P0 implementation
 * Links: ../types.ts, billing.ts, GRAPH_EXECUTION.md
 * @public
 */

import type { Logger } from "pino";

import type { Message } from "@/core";
import type { AccountService, GraphExecutorPort, LlmCaller } from "@/ports";
import { EVENT_NAMES, type RequestContext } from "@/shared/observability";
import type { AiRelayPumpErrorEvent } from "@/shared/observability/events/ai";
import type { RunContext } from "@/types/run-context";
import type { AiEvent, StreamFinalResult } from "../types";
import { commitUsageFact } from "./billing";
import { createRunIdentity } from "./run-id-factory";

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
  /** Graph name to execute (default: uses adapter fallback) */
  readonly graphName?: string;
}

/**
 * Dependencies for AI runtime.
 * Per UNIFIED_GRAPH_EXECUTOR: uses GraphExecutorPort, not direct LLM calls.
 */
export interface AiRuntimeDeps {
  readonly graphExecutor: GraphExecutorPort;
  readonly accountService: AccountService;
}

/**
 * AI runtime result with stream and completion promise.
 */
export interface AiRuntimeResult {
  /** Stream of AI events for real-time rendering (usage_report filtered out) */
  readonly stream: AsyncIterable<AiEvent>;
  /** Promise resolving with final result (ok with usage/finishReason, or error) */
  readonly final: Promise<StreamFinalResult>;
}

/**
 * Create an AI runtime instance with injected dependencies.
 * Entry point for AI chat streaming via GraphExecutorPort.
 *
 * @param deps - Injected service dependencies
 * @returns Runtime with runChatStream method
 */
export function createAiRuntime(deps: AiRuntimeDeps) {
  const { graphExecutor, accountService } = deps;

  /**
   * Run a chat stream as AiEvents.
   * Per UNIFIED_GRAPH_EXECUTOR: delegates to graphExecutor.runGraph().
   * Per BILLING_INDEPENDENT_OF_CLIENT: uses RunEventRelay for pump+fanout.
   *
   * @param input - Chat input (messages, model, caller)
   * @param ctx - Request context for logging/telemetry
   * @returns Stream of AiEvents (usage_report filtered) and completion promise
   */
  function runChatStream(
    input: AiRuntimeInput,
    ctx: RequestContext
  ): AiRuntimeResult {
    const { messages, model, caller, abortSignal, graphName } = input;
    const log = ctx.log.child({ feature: "ai.runtime" });

    // Create run identity via factory (P0: runId = ingressRequestId = ctx.reqId)
    const identity = createRunIdentity(ctx);
    const { runId, attempt, ingressRequestId } = identity;

    // Create RunContext for relay subscribers (per RELAY_PROVIDES_CONTEXT)
    const runContext: RunContext = { runId, attempt, ingressRequestId };

    // Per GRAPH_ID_NAMESPACED: graphIds are ${providerId}:${graphName}
    // P0: LangGraph is sole provider, so we namespace here. Default graph is 'poet'.
    // Already-namespaced IDs pass through; raw names get "langgraph:" prefix.
    // TODO: Remove default - if no graphName passed, fail fast instead of defaulting
    const resolvedGraphId = graphName?.includes(":")
      ? graphName
      : `langgraph:${graphName ?? "poet"}`;

    log.debug(
      { runId, ingressRequestId, model, graphName: resolvedGraphId },
      "runChatStream starting"
    );

    // Call graph executor (non-async: returns stream handle immediately)
    const { stream: graphStream, final: graphFinal } = graphExecutor.runGraph({
      runId,
      ingressRequestId,
      messages,
      model,
      caller,
      ...(abortSignal && { abortSignal }),
      graphName: resolvedGraphId,
    });

    // Create RunEventRelay for pump+fanout pattern (context provided to subscribers)
    const relay = new RunEventRelay(
      graphStream,
      runContext,
      accountService,
      log
    );

    // Start pump (fire and forget - runs to completion regardless of UI)
    relay.startPump();

    // Transform GraphFinal to StreamFinalResult
    const finalResult = graphFinal.then(
      (gf): StreamFinalResult =>
        gf.ok
          ? {
              ok: true,
              requestId: gf.requestId,
              usage: gf.usage ?? { promptTokens: 0, completionTokens: 0 },
              finishReason: gf.finishReason ?? "stop",
            }
          : {
              ok: false,
              requestId: gf.requestId,
              error: gf.error ?? "internal",
            }
    );

    return {
      stream: relay.uiStream(),
      final: finalResult,
    };
  }

  return {
    runChatStream,
  };
}

// ============================================================================
// RunEventRelay: Pump + Fanout Pattern
// ============================================================================

/**
 * RunEventRelay implements the StreamDriver + Fanout pattern per GRAPH_EXECUTION.md.
 *
 * Invariants:
 * - BILLING_INDEPENDENT_OF_CLIENT: Pump runs to completion; UI disconnect doesn't stop billing
 * - RELAY_PROVIDES_CONTEXT: Subscribers receive RunContext from relay, not from events
 * - Billing subscriber calls commitUsageFact() for each usage_report event
 * - UI stream filters out usage_report events (internal to billing)
 * - callIndex tracked per-run for deterministic fallback usageUnitId
 */
class RunEventRelay {
  private readonly uiQueue: AiEvent[] = [];
  private uiResolve: (() => void) | null = null;
  private pumpDone = false;
  private callIndex = 0;

  constructor(
    private readonly upstream: AsyncIterable<AiEvent>,
    private readonly context: RunContext,
    private readonly accountService: AccountService,
    private readonly log: Logger
  ) {}

  /**
   * Wake up UI stream if waiting. Called when events are queued or pump finishes.
   * Centralizes resolve-and-clear pattern to prevent race conditions.
   */
  private notifyUi(): void {
    if (this.uiResolve) {
      const resolve = this.uiResolve;
      this.uiResolve = null;
      resolve();
    }
  }

  /**
   * Start the pump loop. Runs to completion, regardless of UI consumption.
   * Fire-and-forget: errors are logged but not propagated.
   */
  startPump(): void {
    this.pump().catch((err) => {
      // Log pump error with event registry
      const pumpErrorEvent: AiRelayPumpErrorEvent = {
        event: EVENT_NAMES.AI_RELAY_PUMP_ERROR,
        reqId: this.context.ingressRequestId,
        runId: this.context.runId,
        errorCode: "pump_failed",
      };
      this.log.error({ ...pumpErrorEvent, err });
      this.pumpDone = true;
      this.notifyUi();
    });
  }

  /**
   * Internal pump loop. Consumes upstream to completion.
   * Uses try/finally to guarantee pumpDone is set even on errors.
   * Emits error event on failure so uiStream terminates on protocol, not pumpDone.
   */
  private async pump(): Promise<void> {
    try {
      for await (const event of this.upstream) {
        // Billing subscriber: process usage_report events
        if (event.type === "usage_report") {
          await this.handleBilling(event);
          // Don't forward usage_report to UI
          continue;
        }

        // UI subscriber: queue all other events
        this.uiQueue.push(event);
        this.notifyUi();
      }
    } catch (err) {
      // Emit error event so uiStream terminates on protocol
      const errorEvent: AiEvent = {
        type: "error",
        error: "internal",
      };
      this.uiQueue.push(errorEvent);
      this.notifyUi();
      throw err; // Re-throw for startPump's catch handler to log
    } finally {
      this.pumpDone = true;
      this.notifyUi();
    }
  }

  /**
   * Handle billing for a usage_report event.
   * Per BILLING_INDEPENDENT_OF_CLIENT: errors are logged, never propagated.
   * Per RELAY_PROVIDES_CONTEXT: context passed to commitUsageFact (not from event).
   */
  private async handleBilling(event: {
    type: "usage_report";
    fact: import("@/types/usage").UsageFact;
  }): Promise<void> {
    try {
      await commitUsageFact(
        event.fact,
        this.callIndex++,
        this.context,
        this.accountService,
        this.log
      );
    } catch (error) {
      // BILLING_INDEPENDENT_OF_CLIENT: never propagate to UI
      this.log.error(
        { err: error, runId: event.fact.runId, callIndex: this.callIndex - 1 },
        "RunEventRelay: billing error swallowed"
      );
    }
  }

  /**
   * UI stream: yields events from queue, filters out usage_report.
   * Safe to abandon - pump continues regardless.
   *
   * CRITICAL: Terminates on protocol events (done/error), NOT on pumpDone.
   * This eliminates hangs where done is delivered but pump hasn't set pumpDone yet.
   */
  async *uiStream(): AsyncIterable<AiEvent> {
    while (true) {
      // Drain queue, terminating on protocol events
      while (this.uiQueue.length > 0) {
        const event = this.uiQueue.shift();
        if (event) {
          yield event;
          // Terminate immediately on terminal events (protocol-level termination)
          if (event.type === "done" || event.type === "error") {
            return;
          }
        }
      }

      // Escape hatch: pumpDone without terminal event (should not happen in normal flow)
      if (this.pumpDone) {
        return;
      }

      // Wait for more events with race-safe re-check
      await new Promise<void>((resolve) => {
        this.uiResolve = resolve;
        // Re-check after installing resolver (race-safe)
        if (this.pumpDone || this.uiQueue.length > 0) {
          this.uiResolve = null;
          resolve();
        }
      });
    }
  }
}

/**
 * Type for the AI runtime instance.
 */
export type AiRuntime = ReturnType<typeof createAiRuntime>;
