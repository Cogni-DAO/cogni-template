// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/tests/contracts/model-via-configurable.contract`
 * Purpose: Lock invariants #35-37: model flows via configurable, not ALS.
 * Scope: Tests CogniCompletionAdapter boundary directly. Does NOT test full graph execution.
 * Invariants:
 *   - NO_MODEL_IN_ALS (#35): Model comes from configurable.model, never ALS
 *   - MODEL_READ_FROM_CONFIGURABLE_AT_RUNNABLE_BOUNDARY (#37): Model resolved in invoke()
 *   - THROWS_FAST_IF_MISSING: Throws if model missing from configurable
 * Side-effects: none (all mocked)
 * Links: GRAPH_EXECUTION.md, completion-adapter.ts
 * @internal
 */

import type { AiEvent } from "@cogni/ai-core";
import { HumanMessage } from "@langchain/core/messages";
import { describe, expect, it, vi } from "vitest";
import {
  CogniCompletionAdapter,
  type CompletionFn,
  runWithCogniExecContext,
} from "../../src/runtime/cogni";

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a spy CompletionFn that records calls and returns controlled results.
 */
function createSpyCompletionFn(options?: { shouldFail?: boolean }): {
  fn: CompletionFn;
  calls: Array<{ model: string; messages: unknown[] }>;
} {
  const calls: Array<{ model: string; messages: unknown[] }> = [];

  const fn: CompletionFn = (params) => {
    calls.push({ model: params.model, messages: params.messages });

    const stream = (async function* (): AsyncIterable<AiEvent> {
      yield { type: "text_delta", delta: "response" };
    })();

    const final = options?.shouldFail
      ? Promise.resolve({ ok: false as const, error: "internal" })
      : Promise.resolve({
          ok: true as const,
          content: "Test response",
          usage: { promptTokens: 10, completionTokens: 5 },
          finishReason: "stop",
        });

    return { stream, final };
  };

  return { fn, calls };
}

/**
 * Create minimal ALS context for testing.
 * Per #35: NO model field — model comes from configurable.
 */
function createTestRuntime(completionFn: CompletionFn) {
  return {
    completionFn,
    tokenSink: { push: vi.fn() },
    toolExecFn: vi.fn(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Contract Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("CogniCompletionAdapter (model-via-configurable contract)", () => {
  describe("T1: model from configurable", () => {
    it("reads model from config.configurable.model, not ALS", async () => {
      const { fn: completionFn, calls } = createSpyCompletionFn();
      const runtime = createTestRuntime(completionFn);
      const llm = new CogniCompletionAdapter();

      const messages = [new HumanMessage("Hello")];
      const testModel = "test-model-from-configurable";

      // Invoke within ALS context, model in configurable (not ALS)
      await runWithCogniExecContext(runtime, () =>
        llm.invoke(messages, {
          configurable: { model: testModel },
        })
      );

      // Verify completionFn called exactly once
      expect(calls).toHaveLength(1);

      // Verify model came from configurable
      expect(calls[0].model).toBe(testModel);
    });

    it("passes different models correctly per invocation", async () => {
      const { fn: completionFn, calls } = createSpyCompletionFn();
      const runtime = createTestRuntime(completionFn);
      const llm = new CogniCompletionAdapter();

      const messages = [new HumanMessage("Hello")];

      // Invoke twice with different models
      await runWithCogniExecContext(runtime, () =>
        llm.invoke(messages, { configurable: { model: "model-A" } })
      );
      await runWithCogniExecContext(runtime, () =>
        llm.invoke(messages, { configurable: { model: "model-B" } })
      );

      expect(calls).toHaveLength(2);
      expect(calls[0].model).toBe("model-A");
      expect(calls[1].model).toBe("model-B");
    });
  });

  describe("T2: missing model fails fast", () => {
    it("throws when configurable.model is missing", async () => {
      const { fn: completionFn, calls } = createSpyCompletionFn();
      const runtime = createTestRuntime(completionFn);
      const llm = new CogniCompletionAdapter();

      const messages = [new HumanMessage("Hello")];

      // Invoke without model in configurable
      await expect(
        runWithCogniExecContext(runtime, () =>
          llm.invoke(messages, { configurable: {} })
        )
      ).rejects.toThrow("configurable.model is required");

      // Verify completionFn was NOT called
      expect(calls).toHaveLength(0);
    });

    it("throws when configurable is undefined", async () => {
      const { fn: completionFn, calls } = createSpyCompletionFn();
      const runtime = createTestRuntime(completionFn);
      const llm = new CogniCompletionAdapter();

      const messages = [new HumanMessage("Hello")];

      await expect(
        runWithCogniExecContext(runtime, () => llm.invoke(messages, {}))
      ).rejects.toThrow("configurable.model is required");

      expect(calls).toHaveLength(0);
    });

    it("throws when config is undefined", async () => {
      const { fn: completionFn, calls } = createSpyCompletionFn();
      const runtime = createTestRuntime(completionFn);
      const llm = new CogniCompletionAdapter();

      const messages = [new HumanMessage("Hello")];

      await expect(
        runWithCogniExecContext(runtime, () => llm.invoke(messages))
      ).rejects.toThrow("configurable.model is required");

      expect(calls).toHaveLength(0);
    });
  });

  describe("T3: ALS context required", () => {
    it("throws when invoked outside ALS context", async () => {
      const llm = new CogniCompletionAdapter();
      const messages = [new HumanMessage("Hello")];

      await expect(
        llm.invoke(messages, { configurable: { model: "test-model" } })
      ).rejects.toThrow("outside of runWithCogniExecContext");
    });
  });
});
