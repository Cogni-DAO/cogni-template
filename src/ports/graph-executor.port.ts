// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@ports/graph-executor`
 * Purpose: Port interface for unified graph execution with run-centric billing.
 * Scope: Defines GraphExecutorPort contract for all graph executors (in-proc, Claude SDK, external). Does not implement execution logic.
 * Invariants:
 * - UNIFIED_GRAPH_EXECUTOR: All graph execution flows through this port
 * - GRAPH_FINALIZATION_ONCE: Exactly one done event and final resolution per run
 * - P0_ATTEMPT_FREEZE: attempt is always 0 in P0
 * - GRAPH_ID_NAMESPACED: graphId format is ${providerId}:${graphName}
 * Side-effects: none (interface only)
 * Notes: Discovery (listAgents) is in AgentCatalogPort, not here.
 * Links: InProcCompletionUnitAdapter, GRAPH_EXECUTION.md, @/types/ai-events.ts
 * @public
 */

import type { AiExecutionErrorCode } from "@cogni/ai-core";
import type { Message } from "@/core";
import type { AiEvent } from "@/types/ai-events";
import type { LlmCaller } from "./llm.port";

// Re-export canonical error code type from ai-core
export type { AiExecutionErrorCode } from "@cogni/ai-core";

/**
 * Request to execute a graph.
 */
export interface GraphRunRequest {
  /** Unique run ID for this graph execution (caller-provided) */
  readonly runId: string;
  /** Ingress request ID for delivery-layer correlation (P0: equals runId; P1: many per runId) */
  readonly ingressRequestId: string;
  /** Conversation messages */
  readonly messages: Message[];
  /** Model identifier */
  readonly model: string;
  /** Caller info for billing/telemetry */
  readonly caller: LlmCaller;
  /** Optional abort signal for cancellation */
  readonly abortSignal?: AbortSignal;
  /**
   * Fully-qualified graph ID for routing (e.g., "langgraph:poet").
   * Required - executor fails fast if not provided.
   * Per GRAPH_ID_NAMESPACED: format is ${providerId}:${graphName}
   */
  readonly graphId: string;
  /**
   * Per-run tool allowlist from GraphRunConfig.
   * Tools not in this list receive policy_denied error.
   * If undefined, falls back to catalog default (P0 acceptable, logs warning).
   */
  readonly toolIds?: readonly string[];
}

/**
 * Final result after graph execution completes.
 */
export interface GraphFinal {
  /** True if graph completed successfully */
  readonly ok: boolean;
  /** Run ID for correlation */
  readonly runId: string;
  /** Request ID for correlation */
  readonly requestId: string;
  /** Token usage totals (if successful) */
  readonly usage?: {
    readonly promptTokens: number;
    readonly completionTokens: number;
  };
  /** How the graph finished */
  readonly finishReason?: string;
  /** Error type if not ok */
  readonly error?: AiExecutionErrorCode;
  /** Final assistant response content (for trace output) */
  readonly content?: string;
}

/**
 * Result of starting a graph execution.
 * Non-async: returns stream handle immediately; execution happens on consumption.
 */
export interface GraphRunResult {
  /** Stream of AI events for real-time processing */
  readonly stream: AsyncIterable<AiEvent>;
  /** Promise resolving when graph completes */
  readonly final: Promise<GraphFinal>;
}

/**
 * Port interface for graph execution.
 * Per UNIFIED_GRAPH_EXECUTOR invariant: all graphs flow through this interface.
 *
 * Non-async method: returns stream handle immediately.
 * Actual execution happens as the stream is consumed.
 *
 * Note: Discovery (listing agents) is in AgentCatalogPort, not here.
 */
export interface GraphExecutorPort {
  /**
   * Execute a graph with the given request.
   * Returns stream handle immediately; consume stream to drive execution.
   *
   * @param req - Graph run request with messages, model, caller info
   * @returns Stream of events and promise for final result
   */
  runGraph(req: GraphRunRequest): GraphRunResult;
}
