// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/ai/graph-provider`
 * Purpose: Internal interface for graph execution providers.
 * Scope: Defines provider contract for AggregatingGraphExecutor. NOT a public port in P0.
 * Invariants:
 *   - PROVIDER_AGGREGATION: AggregatingGraphExecutor routes graphId → GraphProvider
 *   - NO_PARALLEL_REQUEST_TYPES: runGraph uses GraphRunRequest/GraphRunResult from @/ports
 *   - GRAPH_ID_NAMESPACED: graphId format is ${providerId}:${graphName}
 * Side-effects: none
 * Notes: Discovery is in AgentCatalogProvider, not here.
 * Links: GRAPH_EXECUTION.md, aggregating-executor.ts
 * @internal
 */

import type { GraphRunRequest, GraphRunResult } from "@/ports";

/**
 * Internal interface for graph execution providers.
 *
 * NOT a public port in P0 — stays in adapters layer.
 * AggregatingGraphExecutor routes by graphId prefix to appropriate provider.
 *
 * Per NO_PARALLEL_REQUEST_TYPES: runGraph uses same types as GraphExecutorPort.
 * Thread/run-shaped API (createThread, createRun, streamRun) deferred to P1.
 *
 * Note: Discovery (listAgents) is in AgentCatalogProvider, not here.
 */
export interface GraphProvider {
  /** Provider identifier (e.g., "langgraph", "claude_sdk") */
  readonly providerId: string;

  /**
   * Check if this provider handles the given graphId.
   * Used by aggregator for routing.
   *
   * @param graphId - Namespaced graph ID (e.g., "langgraph:poet")
   * @returns true if this provider handles the graph
   */
  canHandle(graphId: string): boolean;

  /**
   * Execute a graph run.
   * Returns immediately with stream handle; execution happens on consumption.
   *
   * Per NO_PARALLEL_REQUEST_TYPES: uses GraphRunRequest/GraphRunResult from @/ports.
   *
   * @param req - Graph run request
   * @returns Stream and final promise
   */
  runGraph(req: GraphRunRequest): GraphRunResult;
}
