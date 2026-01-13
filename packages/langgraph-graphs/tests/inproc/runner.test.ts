// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/tests/inproc/runner`
 * Purpose: Contract tests for createInProcGraphRunner terminal invariants.
 * Scope: Verifies AiEvent sequence correctness (assistant_final, done, error) NOT exact token sequences.
 * Invariants:
 *   - ASSISTANT_FINAL_REQUIRED: exactly one on success; zero on error/abort
 *   - GRAPH_FINALIZATION_ONCE: exactly one done per run, always last
 *   - RESULT_REFLECTS_OUTCOME: final.ok matches stream outcome
 * Side-effects: none (all mocked)
 * Links: LANGGRAPH_AI.md, runner.ts
 * @internal
 */

import type { AiEvent } from "@cogni/ai-core";
import { AIMessage } from "@langchain/core/messages";
import { describe, expect, it } from "vitest";

import { createInProcGraphRunner } from "../../src/inproc/runner";
import type {
  CompletionFn,
  CompletionResult,
  CreateGraphFn,
  InProcGraphRequest,
  ToolExecFn,
} from "../../src/inproc/types";

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Collect all events from stream into array.
 */
async function collectEvents(
  stream: AsyncIterable<AiEvent>
): Promise<AiEvent[]> {
  const events: AiEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

/**
 * Create a fake CompletionFn that returns controlled results.
 */
function createFakeCompletionFn(options: {
  content?: string;
  shouldThrow?: boolean;
  errorMessage?: string;
}): CompletionFn {
  return () => {
    const stream = (async function* (): AsyncIterable<AiEvent> {
      if (!options.shouldThrow) {
        yield { type: "text_delta", delta: options.content ?? "test" };
      }
    })();

    const final: Promise<CompletionResult> = options.shouldThrow
      ? Promise.reject(new Error(options.errorMessage ?? "Completion failed"))
      : Promise.resolve({
          ok: true,
          content: options.content ?? "test",
          usage: { promptTokens: 10, completionTokens: 5 },
          finishReason: "stop",
        });

    return { stream, final };
  };
}

/**
 * Create a fake graph factory that returns a minimal invokable graph.
 */
function createFakeGraphFactory(options: {
  shouldThrow?: boolean;
  errorMessage?: string;
  throwAbortError?: boolean;
}): CreateGraphFn {
  return () => ({
    invoke: async (
      _input: unknown,
      invokeOptions?: { signal?: AbortSignal }
    ) => {
      // Check abort signal
      if (invokeOptions?.signal?.aborted) {
        const error = new Error("Aborted");
        error.name = "AbortError";
        throw error;
      }

      if (options.throwAbortError) {
        const error = new Error("Aborted");
        error.name = "AbortError";
        throw error;
      }

      if (options.shouldThrow) {
        throw new Error(options.errorMessage ?? "Graph execution failed");
      }

      // Return minimal result with assistant message
      return {
        messages: [new AIMessage({ content: "Assistant response" })],
      };
    },
  });
}

/**
 * Create minimal runner options for testing.
 */
function createTestRunnerOptions(overrides?: {
  createGraph?: CreateGraphFn;
  completionFn?: CompletionFn;
}): Parameters<typeof createInProcGraphRunner>[0] {
  const request: InProcGraphRequest = {
    runId: "test-run-id",
    messages: [{ role: "user", content: "Hello" }],
    model: "test-model",
  };

  return {
    createGraph: overrides?.createGraph ?? createFakeGraphFactory({}),
    completionFn: overrides?.completionFn ?? createFakeCompletionFn({}),
    createToolExecFn: (): ToolExecFn => async () => ({ ok: true, value: {} }),
    toolContracts: [],
    request,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Contract Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("createInProcGraphRunner", () => {
  describe("success path", () => {
    it("emits exactly one assistant_final, done is last, final.ok is true", async () => {
      const opts = createTestRunnerOptions();
      const { stream, final } = createInProcGraphRunner(opts);

      const events = await collectEvents(stream);
      const result = await final;

      // Terminal invariants
      const assistantFinals = events.filter(
        (e) => e.type === "assistant_final"
      );
      const dones = events.filter((e) => e.type === "done");
      const errors = events.filter((e) => e.type === "error");

      expect(assistantFinals).toHaveLength(1);
      expect(dones).toHaveLength(1);
      expect(errors).toHaveLength(0);

      // done must be last
      expect(events[events.length - 1]).toEqual({ type: "done" });

      // assistant_final must precede done
      const assistantFinalIndex = events.findIndex(
        (e) => e.type === "assistant_final"
      );
      const doneIndex = events.findIndex((e) => e.type === "done");
      expect(assistantFinalIndex).toBeLessThan(doneIndex);

      // final reflects success
      expect(result.ok).toBe(true);
    });
  });

  describe("error path", () => {
    it("emits error then done, never assistant_final, final.ok is false", async () => {
      const opts = createTestRunnerOptions({
        createGraph: createFakeGraphFactory({
          shouldThrow: true,
          errorMessage: "Graph failed",
        }),
      });
      const { stream, final } = createInProcGraphRunner(opts);

      const events = await collectEvents(stream);
      const result = await final;

      // Terminal invariants
      const assistantFinals = events.filter(
        (e) => e.type === "assistant_final"
      );
      const dones = events.filter((e) => e.type === "done");
      const errors = events.filter((e) => e.type === "error");

      expect(assistantFinals).toHaveLength(0);
      expect(errors).toHaveLength(1);
      expect(dones).toHaveLength(1);

      // done must be last
      expect(events[events.length - 1]).toEqual({ type: "done" });

      // error must precede done
      const errorIndex = events.findIndex((e) => e.type === "error");
      const doneIndex = events.findIndex((e) => e.type === "done");
      expect(errorIndex).toBeLessThan(doneIndex);

      // error should be normalized to 'internal'
      expect(errors[0]).toEqual({ type: "error", error: "internal" });

      // final reflects failure
      expect(result.ok).toBe(false);
      expect(result.error).toBe("internal");
    });
  });

  describe("abort path", () => {
    it("propagates abort signal, emits error=aborted then done", async () => {
      const opts = createTestRunnerOptions({
        createGraph: createFakeGraphFactory({ throwAbortError: true }),
      });
      const { stream, final } = createInProcGraphRunner(opts);

      const events = await collectEvents(stream);
      const result = await final;

      // Terminal invariants
      const assistantFinals = events.filter(
        (e) => e.type === "assistant_final"
      );
      const dones = events.filter((e) => e.type === "done");
      const errors = events.filter((e) => e.type === "error");

      expect(assistantFinals).toHaveLength(0);
      expect(errors).toHaveLength(1);
      expect(dones).toHaveLength(1);

      // done must be last
      expect(events[events.length - 1]).toEqual({ type: "done" });

      // error should be 'aborted'
      expect(errors[0]).toEqual({ type: "error", error: "aborted" });

      // final reflects abort
      expect(result.ok).toBe(false);
      expect(result.error).toBe("aborted");
    });
  });

  describe("terminal integrity (REQ2)", () => {
    it("never emits more than one terminal event type", async () => {
      // Test success path - should have exactly one assistant_final, one done
      const successOpts = createTestRunnerOptions();
      const successResult = createInProcGraphRunner(successOpts);
      const successEvents = await collectEvents(successResult.stream);

      const successTerminals = successEvents.filter(
        (e) =>
          e.type === "assistant_final" ||
          e.type === "error" ||
          e.type === "done"
      );

      // Should have exactly: assistant_final + done (2 terminals)
      expect(successTerminals).toHaveLength(2);
      expect(
        successTerminals.filter((e) => e.type === "assistant_final")
      ).toHaveLength(1);
      expect(successTerminals.filter((e) => e.type === "done")).toHaveLength(1);
      expect(successTerminals.filter((e) => e.type === "error")).toHaveLength(
        0
      );

      // Test error path - should have exactly one error, one done
      const errorOpts = createTestRunnerOptions({
        createGraph: createFakeGraphFactory({ shouldThrow: true }),
      });
      const errorResult = createInProcGraphRunner(errorOpts);
      const errorEvents = await collectEvents(errorResult.stream);

      const errorTerminals = errorEvents.filter(
        (e) =>
          e.type === "assistant_final" ||
          e.type === "error" ||
          e.type === "done"
      );

      // Should have exactly: error + done (2 terminals)
      expect(errorTerminals).toHaveLength(2);
      expect(
        errorTerminals.filter((e) => e.type === "assistant_final")
      ).toHaveLength(0);
      expect(errorTerminals.filter((e) => e.type === "done")).toHaveLength(1);
      expect(errorTerminals.filter((e) => e.type === "error")).toHaveLength(1);

      // Verify mutual exclusivity: never both assistant_final AND error
      const hasAssistantFinal = successEvents.some(
        (e) => e.type === "assistant_final"
      );
      const hasError = successEvents.some((e) => e.type === "error");
      expect(hasAssistantFinal && hasError).toBe(false);
    });
  });
});
