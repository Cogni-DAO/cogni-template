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
  AiExecutionErrorCode,
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

    // Validate required input
    if (!graphName) {
      this.log.warn({ runId }, "graphName is required but was not provided");
      return this.createErrorResult(
        runId,
        req.ingressRequestId,
        "invalid_request"
      );
    }

    // Find provider that can handle this graphId
    const provider = this.providers.find((p) => p.canHandle(graphName));
    if (provider) {
      this.log.debug(
        { runId, graphName, providerId: provider.providerId },
        "Routing to provider"
      );
      return provider.runGraph(req);
    }

    // No provider found - server configuration issue
    this.log.error(
      {
        runId,
        graphName,
        availableProviders: this.providers.map((p) => p.providerId),
      },
      "No provider found for graphId"
    );
    return this.createErrorResult(runId, req.ingressRequestId, "internal");
  }

  /**
   * Create error result with typed code.
   */
  private createErrorResult(
    runId: string,
    requestId: string,
    code: AiExecutionErrorCode
  ): GraphRunResult {
    return {
      stream: this.createErrorStream(code),
      final: Promise.resolve({
        ok: false,
        runId,
        requestId,
        error: code,
      }),
    };
  }

  /**
   * Create an error stream that yields error event then done.
   */
  private async *createErrorStream(
    code: AiExecutionErrorCode
  ): AsyncIterable<import("@/types/ai-events").AiEvent> {
    yield { type: "error", error: code };
    yield { type: "done" };
  }
}
