// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/unit/adapters/server/ai/inproc-completion-unit.deadlock.spec`
 * Purpose: Test that InProcCompletionUnitAdapter.executeCompletionUnit does not deadlock when final requires stream close.
 * Scope: Reproduces the deadlock where awaiting final inside for-await prevents stream completion. Does NOT test happy-path streaming or error flows.
 * Invariants: NO_AWAIT_FINAL_IN_LOOP (must break out of for-await before awaiting final)
 * Side-effects: none
 * Links: GRAPH_EXECUTION.md, AGENT_DISCOVERY.md, inproc-completion-unit.adapter.ts
 * @internal
 */

import { describe, expect, it } from "vitest";

import { InProcCompletionUnitAdapter } from "@/adapters/server/ai/inproc-completion-unit.adapter";
import type { ChatDeltaEvent } from "@/ports";
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
    requestId: "req-123",
    content: "Hello world",
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    finishReason: "stop" as const,
    litellmCallId: "call-123",
    providerCostUsd: 0.001,
    model: "test-model",
  }));

  return {
    stream: fakeStream(),
    final,
  };
}

describe("InProcCompletionUnitAdapter deadlock prevention", () => {
  it("executeCompletionUnit does not deadlock when final requires stream close (NO_AWAIT_FINAL_IN_LOOP)", async () => {
    // This test FAILS with buggy code (deadlock) and PASSES with correct code.
    //
    // The bug: adapter awaits `final` inside the for-await loop when it sees `done`.
    // But `final` only resolves when the iterator closes (in finally block).
    // The iterator can't close because we're blocked on `await final`.
    // Result: deadlock, stream never completes.
    //
    // Per COMPLETION_UNIT_NOT_PORT: InProcCompletionUnitAdapter provides
    // executeCompletionUnit() for providers, not runGraph().

    const adapter = new InProcCompletionUnitAdapter(
      {
        llmService: {} as never, // Not used in this test
        accountService: {} as never,
        clock: {} as never,
        aiTelemetry: {} as never,
        langfuse: undefined,
      },
      async () => createDeadlockProneCompletion()
    );

    const result = adapter.executeCompletionUnit({
      messages: [{ role: "user", content: "test" }],
      model: "test-model",
      caller: {
        billingAccountId: "billing-123",
        virtualKeyId: "vk-123",
        requestId: "req-123",
        traceId: "trace-123",
      },
      runContext: {
        runId: "run-123",
        attempt: 0,
        ingressRequestId: "req-123",
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

    // Assert: received text_delta and usage_report events
    const eventTypes = collectedEvents.map((e) => e.type);
    expect(eventTypes).toContain("text_delta");

    // Note: executeCompletionUnit does NOT emit "done" - caller handles that
    // per COMPLETION_UNIT_NOT_PORT invariant. It only emits text_delta + usage_report.
    expect(eventTypes).not.toContain("done");

    // Assert: usage_report is emitted (billing flow)
    const usageIndex = eventTypes.indexOf("usage_report");
    expect(usageIndex).toBeGreaterThan(-1);

    // Assert: usage_report is the last event (no done from completion unit)
    expect(collectedEvents[collectedEvents.length - 1].type).toBe(
      "usage_report"
    );
  });
});
