// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/unit/adapters/server/ai/aggregating-executor`
 * Purpose: Unit tests for AggregatingGraphExecutor routing behavior.
 * Scope: Verifies graphId routing, provider dispatch. Does NOT test actual graph execution, billing, or provider internals.
 * Invariants:
 *   - PROVIDER_AGGREGATION: Routes by graphId prefix to correct provider
 * Side-effects: none
 * Notes: Discovery (listAgents) is tested in aggregating-agent-catalog.spec.ts
 * Links: aggregating-executor.ts, GRAPH_EXECUTION.md
 * @public
 */

import {
  createMockGraphProvider,
  createTestGraphRunRequest,
} from "@tests/_fixtures/ai/fixtures";
import { describe, expect, it, vi } from "vitest";
import { AggregatingGraphExecutor } from "@/adapters/server/ai/aggregating-executor";
import type { GraphProvider } from "@/adapters/server/ai/graph-provider";

describe("AggregatingGraphExecutor", () => {
  describe("fail-fast behavior", () => {
    it("returns error when graphId does not match any provider", async () => {
      const provider = createMockGraphProvider("langgraph", ["chat"]);
      const aggregator = new AggregatingGraphExecutor([provider]);

      const request = createTestGraphRunRequest({ graphId: "unknown:graph" });
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
      const langGraphProvider = createMockGraphProvider("langgraph", [
        "chat",
        "poet",
      ]);
      const claudeProvider = createMockGraphProvider("claude_sdk", ["planner"]);
      const aggregator = new AggregatingGraphExecutor([
        langGraphProvider,
        claudeProvider,
      ]);

      // Route to langgraph provider
      const request1 = createTestGraphRunRequest({ graphId: "langgraph:poet" });
      aggregator.runGraph(request1);
      expect(langGraphProvider.runGraph).toHaveBeenCalledWith(request1);
      expect(claudeProvider.runGraph).not.toHaveBeenCalled();

      // Reset mocks
      vi.clearAllMocks();

      // Route to claude provider
      const request2 = createTestGraphRunRequest({
        graphId: "claude_sdk:planner",
      });
      aggregator.runGraph(request2);
      expect(claudeProvider.runGraph).toHaveBeenCalledWith(request2);
      expect(langGraphProvider.runGraph).not.toHaveBeenCalled();
    });

    it("uses first matching provider when multiple could handle", () => {
      // Both providers claim to handle "shared" prefix
      const provider1: GraphProvider = {
        providerId: "shared",
        canHandle: (graphId) => graphId.startsWith("shared:"),
        runGraph: vi.fn().mockReturnValue({
          stream: (async function* () {
            yield { type: "done" };
          })(),
          final: Promise.resolve({
            ok: true,
            runId: "test",
            requestId: "test",
          }),
        }),
      };
      const provider2: GraphProvider = {
        providerId: "shared",
        canHandle: (graphId) => graphId.startsWith("shared:"),
        runGraph: vi.fn().mockReturnValue({
          stream: (async function* () {
            yield { type: "done" };
          })(),
          final: Promise.resolve({
            ok: true,
            runId: "test",
            requestId: "test",
          }),
        }),
      };

      const aggregator = new AggregatingGraphExecutor([provider1, provider2]);
      const request = createTestGraphRunRequest({ graphId: "shared:test" });

      aggregator.runGraph(request);

      // First provider in array should be called
      expect(provider1.runGraph).toHaveBeenCalled();
      expect(provider2.runGraph).not.toHaveBeenCalled();
    });
  });
});
