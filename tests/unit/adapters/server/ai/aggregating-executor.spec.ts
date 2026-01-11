// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/unit/adapters/server/ai/aggregating-executor`
 * Purpose: Unit tests for AggregatingGraphExecutor routing and fail-fast behavior.
 * Scope: Verifies graphId routing, missing graphId rejection, provider dispatch. Does NOT test actual graph execution, billing, or provider internals.
 * Invariants:
 *   - GRAPH_ID_REQUIRED: Execution fails fast when graphName is undefined
 *   - PROVIDER_AGGREGATION: Routes by graphId prefix to correct provider
 * Side-effects: none
 * Links: aggregating-executor.ts, GRAPH_EXECUTION.md
 * @public
 */

import { describe, expect, it, vi } from "vitest";

import { AggregatingGraphExecutor } from "@/adapters/server/ai/aggregating-executor";
import type {
  GraphDescriptor,
  GraphProvider,
} from "@/adapters/server/ai/graph-provider";
import type { GraphRunRequest } from "@/ports";

/**
 * Create a mock provider for testing.
 */
function createMockProvider(
  providerId: string,
  graphNames: string[]
): GraphProvider {
  const graphDescriptors: GraphDescriptor[] = graphNames.map((name) => ({
    graphId: `${providerId}:${name}`,
    displayName: name,
    description: `Test ${name} graph`,
    capabilities: {
      supportsStreaming: true,
      supportsTools: true,
      supportsMemory: false,
    },
  }));

  return {
    providerId,
    listGraphs: () => graphDescriptors,
    canHandle: (graphId: string) => graphId.startsWith(`${providerId}:`),
    runGraph: vi.fn().mockReturnValue({
      stream: (async function* () {
        yield { type: "done" };
      })(),
      final: Promise.resolve({ ok: true, runId: "test", requestId: "test" }),
    }),
  };
}

/**
 * Create a minimal GraphRunRequest for testing.
 */
function createTestRequest(
  overrides: Partial<GraphRunRequest> = {}
): GraphRunRequest {
  return {
    runId: "test-run-id",
    ingressRequestId: "test-ingress-id",
    messages: [],
    model: "test-model",
    caller: {
      billingAccountId: "test-billing",
      virtualKeyId: "test-vkey",
      requestId: "test-req",
      traceId: "00000000000000000000000000000000",
    },
    ...overrides,
  };
}

describe("AggregatingGraphExecutor", () => {
  describe("fail-fast behavior", () => {
    it("returns error when graphName is undefined", async () => {
      const provider = createMockProvider("langgraph", ["chat"]);
      const aggregator = new AggregatingGraphExecutor([provider]);

      // Request without graphName
      const request = createTestRequest({ graphName: undefined });
      const result = aggregator.runGraph(request);

      // Should return error result immediately (fail-fast)
      const final = await result.final;
      expect(final.ok).toBe(false);
      expect(final.error).toBe("invalid_request");

      // Stream should emit error and done
      const events: unknown[] = [];
      for await (const event of result.stream) {
        events.push(event);
      }
      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({
        type: "error",
        error: "invalid_request",
      });
      expect(events[1]).toEqual({ type: "done" });

      // Provider should NOT be called
      expect(provider.runGraph).not.toHaveBeenCalled();
    });

    it("returns error when graphName does not match any provider", async () => {
      const provider = createMockProvider("langgraph", ["chat"]);
      const aggregator = new AggregatingGraphExecutor([provider]);

      // Request with unknown graph
      const request = createTestRequest({ graphName: "unknown:graph" });
      const result = aggregator.runGraph(request);

      const final = await result.final;
      expect(final.ok).toBe(false);
      expect(final.error).toBe("internal");

      // Provider should NOT be called
      expect(provider.runGraph).not.toHaveBeenCalled();
    });
  });

  describe("routing", () => {
    it("routes to correct provider based on graphId prefix", async () => {
      const langGraphProvider = createMockProvider("langgraph", ["chat"]);
      const claudeProvider = createMockProvider("claude_sdk", ["planner"]);
      const aggregator = new AggregatingGraphExecutor([
        langGraphProvider,
        claudeProvider,
      ]);

      // Route to langgraph provider
      const request1 = createTestRequest({ graphName: "langgraph:poet" });
      aggregator.runGraph(request1);
      expect(langGraphProvider.runGraph).toHaveBeenCalledWith(request1);
      expect(claudeProvider.runGraph).not.toHaveBeenCalled();

      // Reset mocks
      vi.clearAllMocks();

      // Route to claude provider
      const request2 = createTestRequest({ graphName: "claude_sdk:planner" });
      aggregator.runGraph(request2);
      expect(claudeProvider.runGraph).toHaveBeenCalledWith(request2);
      expect(langGraphProvider.runGraph).not.toHaveBeenCalled();
    });

    it("lists all graphs from all providers", () => {
      const provider1 = createMockProvider("langgraph", ["poet", "research"]);
      const provider2 = createMockProvider("claude_sdk", ["planner"]);
      const aggregator = new AggregatingGraphExecutor([provider1, provider2]);

      const graphs = aggregator.listGraphs();

      expect(graphs).toHaveLength(3);
      expect(graphs.map((g) => g.graphId)).toEqual([
        "langgraph:poet",
        "langgraph:research",
        "claude_sdk:planner",
      ]);
    });
  });
});
