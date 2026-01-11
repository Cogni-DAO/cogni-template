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
 * Links: GRAPH_EXECUTION.md, aggregating-executor.ts
 * @internal
 */

import type { GraphRunRequest, GraphRunResult } from "@/ports";

/**
 * Graph capabilities exposed in descriptor.
 * Used for UI display and feature gating.
 */
export interface GraphCapabilities {
  /** Whether the graph supports streaming responses */
  readonly supportsStreaming: boolean;
  /** Whether the graph supports tool execution */
  readonly supportsTools: boolean;
  /** Whether the graph supports thread persistence (memory) */
  readonly supportsMemory: boolean;
}

/**
 * Graph descriptor for discovery and UI display.
 * Returned by GraphProvider.listGraphs().
 */
export interface GraphDescriptor {
  /** Namespaced graph ID: "${providerId}:${graphName}" (e.g., "langgraph:poet") */
  readonly graphId: string;
  /** Human-readable name for UI display */
  readonly displayName: string;
  /** Description of what this graph does */
  readonly description: string;
  /** Graph capabilities */
  readonly capabilities: GraphCapabilities;
}

/**
 * Internal interface for graph execution providers.
 *
 * NOT a public port in P0 — stays in adapters layer.
 * AggregatingGraphExecutor routes by graphId prefix to appropriate provider.
 *
 * Per NO_PARALLEL_REQUEST_TYPES: runGraph uses same types as GraphExecutorPort.
 * Thread/run-shaped API (createThread, createRun, streamRun) deferred to P1.
 */
export interface GraphProvider {
  /** Provider identifier (e.g., "langgraph", "claude_sdk") */
  readonly providerId: string;

  /**
   * List all graphs available from this provider.
   * Used for discovery and UI graph selector.
   */
  listGraphs(): readonly GraphDescriptor[];

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
