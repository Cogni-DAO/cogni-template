// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/unit/adapters/server/ai/inproc-graph.deadlock.spec`
 * Purpose: Test that InProcGraphExecutorAdapter does not deadlock when final requires stream close.
 * Scope: Reproduces the deadlock where awaiting final inside for-await prevents done emission. Does NOT test happy-path streaming or error flows.
 * Invariants: GRAPH_FINALIZATION_ONCE (graph emits exactly one done event)
 * Side-effects: none
 * Links: GRAPH_EXECUTION.md, inproc-graph.adapter.ts
 * @internal
 */

import { describe, expect, it } from "vitest";

import { InProcGraphExecutorAdapter } from "@/adapters/server/ai/inproc-graph.adapter";
import type { ChatDeltaEvent } from "@/ports";
import { makeNoopLogger } from "@/shared/observability";
import type { AiEvent } from "@/types/ai-events";

/**
 * Creates a fake completion stream that simulates LiteLLM behavior:
 * - Stream yields text_delta events then done
 * - `final` promise only resolves when iterator.return() is called (in finally block)
 *
 * This reproduces the deadlock: if adapter awaits final inside for-await loop,
 * the iterator never closes, finally never runs, final never resolves → hang.
 */
function createDeadlockProneCompletion() {
  let resolveIteratorClosed: () => void;
  const iteratorClosedPromise = new Promise<void>((r) => {
    resolveIteratorClosed = r;
  });

  // Stream that yields done then BLOCKS FOREVER (simulates LiteLLM behavior).
  // The only way to unblock is for the consumer to close the iterator,
  // which triggers finally and resolves iteratorClosedPromise.
  async function* fakeStream(): AsyncGenerator<ChatDeltaEvent> {
    try {
      yield { type: "text_delta", delta: "Hello " };
      yield { type: "text_delta", delta: "world" };
      yield { type: "done" };
      // Block forever after done - simulates LiteLLM not returning until closed
      await new Promise<void>(() => {});
    } finally {
      // Only runs when consumer closes iterator (breaks out of for-await)
      resolveIteratorClosed?.();
    }
  }

  // Final only resolves AFTER iterator is closed (simulates LiteLLM finally block)
  const final = iteratorClosedPromise.then(() => ({
    ok: true as const,
    message: { role: "assistant" as const, content: "Hello world" },
    promptHash: "hash123",
    resolvedProvider: "test",
    resolvedModel: "test-model",
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    finishReason: "stop",
    litellmCallId: "call-123",
    providerCostUsd: 0.001,
  }));

  return {
    stream: fakeStream(),
    final,
  };
}

describe("InProcGraphExecutorAdapter deadlock prevention", () => {
  it("does not deadlock when final requires stream close (GRAPH_FINALIZATION_ONCE)", async () => {
    // This test FAILS with current code (deadlock) and PASSES after fix.
    //
    // The bug: adapter awaits `final` inside the for-await loop when it sees `done`.
    // But `final` only resolves when the iterator closes (in finally block).
    // The iterator can't close because we're blocked on `await final`.
    // Result: deadlock, `done` event never emitted to downstream.

    const adapter = new InProcGraphExecutorAdapter(
      { log: makeNoopLogger() },
      async () => createDeadlockProneCompletion()
    );

    const result = adapter.runGraph({
      runId: "run-123",
      ingressRequestId: "req-123",
      messages: [{ role: "user", content: "test" }],
      model: "test-model",
      caller: {
        billingAccountId: "billing-123",
        virtualKeyId: "vk-123",
        requestId: "req-123",
        traceId: "trace-123",
      },
    });

    const collectedEvents: AiEvent[] = [];

    // If deadlocked, this will timeout. 200ms is plenty for non-blocking code.
    const TIMEOUT_MS = 200;
    const startMs = performance.now();

    const consumePromise = (async () => {
      for await (const event of result.stream) {
        collectedEvents.push(event);
      }
      return "completed";
    })();

    const timeoutPromise = new Promise<"timeout">((r) =>
      setTimeout(() => r("timeout"), TIMEOUT_MS)
    );

    const outcome = await Promise.race([consumePromise, timeoutPromise]);
    const elapsedMs = performance.now() - startMs;

    // Assert: did not timeout (no deadlock)
    expect(outcome).toBe("completed");
    expect(elapsedMs).toBeLessThan(TIMEOUT_MS);

    // Assert: received all events including done
    const eventTypes = collectedEvents.map((e) => e.type);
    expect(eventTypes).toContain("text_delta");
    expect(eventTypes).toContain("done");

    // Assert: done is the last event (per GRAPH_FINALIZATION_ONCE)
    expect(collectedEvents[collectedEvents.length - 1].type).toBe("done");

    // Assert: usage_report emitted before done (billing flow)
    const doneIndex = eventTypes.indexOf("done");
    const usageIndex = eventTypes.indexOf("usage_report");
    expect(usageIndex).toBeGreaterThan(-1);
    expect(usageIndex).toBeLessThan(doneIndex);
  });
});
