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
 * Notes: Discovery (listAgents) is in AggregatingAgentCatalog, not here.
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

import type { GraphProvider } from "./graph-provider";

/**
 * Aggregating graph executor that routes to providers by graphId.
 *
 * Implements GraphExecutorPort for unified graph access.
 * App uses only this aggregator; no facade-level graph conditionals.
 *
 * Per GRAPH_ID_NAMESPACED: graphId format is "${providerId}:${graphName}".
 * The aggregator routes based on the providerId prefix.
 *
 * Note: Discovery (listing agents) is in AggregatingAgentCatalog.
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

    this.log.debug(
      {
        providerCount: providers.length,
        providers: providers.map((p) => p.providerId),
      },
      "AggregatingGraphExecutor initialized"
    );
  }

  /**
   * Execute a graph run by routing to appropriate provider.
   *
   * Routing strategy:
   * 1. Use graphId to find provider that can handle it
   * 2. Provider.canHandle() checks if graphId matches provider's graphs
   *
   * Per UNIFIED_GRAPH_EXECUTOR: all execution flows through this method.
   */
  runGraph(req: GraphRunRequest): GraphRunResult {
    const { runId, graphId } = req;

    this.log.debug(
      { runId, graphId },
      "AggregatingGraphExecutor.runGraph routing"
    );

    // Find provider that can handle this graphId
    const provider = this.providers.find((p) => p.canHandle(graphId));
    if (provider) {
      this.log.debug(
        { runId, graphId, providerId: provider.providerId },
        "Routing to provider"
      );
      return provider.runGraph(req);
    }

    // No provider found - server configuration issue
    this.log.error(
      {
        runId,
        graphId,
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
