// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/ai/aggregating-executor`
 * Purpose: Routes graph execution to appropriate provider by graphId.
 * Scope: Implements GraphExecutorPort for unified graph access. Routes by graphId prefix. Does NOT contain graph orchestration logic.
 * Invariants:
 *   - PROVIDER_AGGREGATION: Routes graphId → GraphProvider
 *   - UNIFIED_GRAPH_EXECUTOR: All graphs flow through GraphExecutorPort
 *   - GRAPH_ID_NAMESPACED: graphId format is ${providerId}:${graphName}
 * Side-effects: none (delegates to providers)
 * Links: GRAPH_EXECUTION.md, graph-provider.ts
 * @public
 */

import type { Logger } from "pino";

import type {
  GraphExecutorPort,
  GraphRunRequest,
  GraphRunResult,
} from "@/ports";
import { makeLogger } from "@/shared/observability";

import type { GraphDescriptor, GraphProvider } from "./graph-provider";

/**
 * Aggregating graph executor that routes to providers by graphId.
 *
 * Implements GraphExecutorPort for unified graph access.
 * App uses only this aggregator; no facade-level graph conditionals.
 *
 * Per GRAPH_ID_NAMESPACED: graphId format is "${providerId}:${graphName}".
 * The aggregator routes based on the providerId prefix.
 */
export class AggregatingGraphExecutor implements GraphExecutorPort {
  private readonly log: Logger;
  private readonly providers: readonly GraphProvider[];

  /**
   * Create aggregating executor with given providers.
   *
   * @param providers - Graph providers to aggregate
   */
  constructor(providers: readonly GraphProvider[]) {
    this.providers = providers;
    this.log = makeLogger({ component: "AggregatingGraphExecutor" });

    // Log registered providers and their graphs
    const graphCount = providers.reduce(
      (sum, p) => sum + p.listGraphs().length,
      0
    );
    this.log.debug(
      {
        providerCount: providers.length,
        graphCount,
        providers: providers.map((p) => p.providerId),
      },
      "AggregatingGraphExecutor initialized"
    );
  }

  /**
   * List all available graphs from all providers.
   * Used for discovery and UI graph selector.
   */
  listGraphs(): readonly GraphDescriptor[] {
    return this.providers.flatMap((p) => p.listGraphs());
  }

  /**
   * Execute a graph run by routing to appropriate provider.
   *
   * Routing strategy:
   * 1. If graphName is provided, try to find provider that can handle it
   * 2. Provider.canHandle() checks if graphId matches provider's graphs
   *
   * Per UNIFIED_GRAPH_EXECUTOR: all execution flows through this method.
   */
  runGraph(req: GraphRunRequest): GraphRunResult {
    const { runId, graphName } = req;

    this.log.debug(
      { runId, graphName },
      "AggregatingGraphExecutor.runGraph routing"
    );

    // Find provider that can handle this graphId
    // graphName in request is the full graphId (e.g., "langgraph:chat")
    if (graphName) {
      const provider = this.providers.find((p) => p.canHandle(graphName));
      if (provider) {
        this.log.debug(
          { runId, graphName, providerId: provider.providerId },
          "Routing to provider"
        );
        return provider.runGraph(req);
      }
    }

    // No provider found for graphId
    this.log.error(
      {
        runId,
        graphName,
        availableProviders: this.providers.map((p) => p.providerId),
      },
      "No provider found for graphId"
    );

    // Return error result
    const errorResult: GraphRunResult = {
      stream: this.createErrorStream(
        `No provider found for graph: ${graphName ?? "undefined"}`
      ),
      final: Promise.resolve({
        ok: false,
        runId,
        requestId: req.ingressRequestId,
        error: "internal" as const,
      }),
    };
    return errorResult;
  }

  /**
   * Create an error stream that yields error event then done.
   */
  private async *createErrorStream(
    message: string
  ): AsyncIterable<import("@/types/ai-events").AiEvent> {
    yield {
      type: "error",
      error: message,
    } as import("@/types/ai-events").ErrorEvent;
    yield { type: "done" } as import("@/types/ai-events").DoneEvent;
  }
}
