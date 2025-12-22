// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/unit/features/ai/services/ai-runtime-relay.test`
 * Purpose: Unit tests for RunEventRelay race conditions in ai_runtime.ts
 * Scope: Tests that uiStream() does not hang when pump finishes between drain and wait.
 * Invariants: BILLING_INDEPENDENT_OF_CLIENT (pump runs to completion)
 * Side-effects: none
 * Links: Tests RunEventRelay in ai_runtime.ts, GRAPH_EXECUTION.md
 * @internal
 */

import {
  createMockAccountServiceWithDefaults,
  createUserMessage,
  FakeClock,
  TEST_MODEL_ID,
} from "@tests/_fakes";
import { describe, expect, it, vi } from "vitest";

import { createAiRuntime } from "@/features/ai/services/ai_runtime";
import type {
  GraphExecutorPort,
  GraphRunRequest,
  GraphRunResult,
} from "@/ports";
import type { RequestContext } from "@/shared/observability";
import { makeNoopLogger } from "@/shared/observability";
import type { AiEvent, DoneEvent, TextDeltaEvent } from "@/types/ai-events";

// Mock serverEnv
vi.mock("@/shared/env", () => ({
  serverEnv: () => ({
    USER_PRICE_MARKUP_FACTOR: 1.5,
  }),
}));

describe("RunEventRelay race conditions", () => {
  const createTestCtx = (): RequestContext => ({
    log: makeNoopLogger(),
    reqId: "test-req-123",
    traceId: "00000000000000000000000000000000",
    routeId: "test.route",
    clock: new FakeClock("2025-01-01T12:00:00.000Z"),
  });

  /**
   * Create a fake graph executor that completes immediately.
   * This simulates the race condition where pump finishes between
   * uiStream()'s drain and wait phases.
   */
  function createImmediateGraphExecutor(events: AiEvent[]): GraphExecutorPort {
    return {
      runGraph(_req: GraphRunRequest): GraphRunResult {
        // Stream that yields all events immediately (simulating fast pump)
        async function* fastStream(): AsyncIterable<AiEvent> {
          for (const event of events) {
            yield event;
          }
        }

        return {
          stream: fastStream(),
          final: Promise.resolve({
            ok: true as const,
            runId: "run-123",
            requestId: "req-123",
            usage: { promptTokens: 10, completionTokens: 5 },
            finishReason: "stop",
          }),
        };
      },
    };
  }

  it("uiStream does not hang when pump finishes immediately after done event", async () => {
    // This test verifies the race-safe fix: uiStream should exit even if
    // the pump finishes between the pumpDone check and Promise creation.

    const events: AiEvent[] = [
      { type: "text_delta", delta: "Hello" } satisfies TextDeltaEvent,
      { type: "text_delta", delta: " world" } satisfies TextDeltaEvent,
      { type: "done" } satisfies DoneEvent,
    ];

    const graphExecutor = createImmediateGraphExecutor(events);
    const accountService = createMockAccountServiceWithDefaults();

    const runtime = createAiRuntime({ graphExecutor, accountService });
    const ctx = createTestCtx();

    const { stream, final } = runtime.runChatStream(
      {
        messages: [createUserMessage("Test")],
        model: TEST_MODEL_ID,
        caller: {
          billingAccountId: "billing-123",
          virtualKeyId: "vk-123",
          requestId: ctx.reqId,
          traceId: ctx.traceId,
        },
      },
      ctx
    );

    // Collect all events with a timeout to detect hangs
    const collectedEvents: AiEvent[] = [];
    const TIMEOUT_MS = 1000;

    const consumeWithTimeout = async () => {
      const timeoutPromise = new Promise<"timeout">((resolve) =>
        setTimeout(() => resolve("timeout"), TIMEOUT_MS)
      );

      const consumePromise = (async () => {
        for await (const event of stream) {
          collectedEvents.push(event);
        }
        return "completed";
      })();

      return Promise.race([consumePromise, timeoutPromise]);
    };

    const result = await consumeWithTimeout();

    // Assert: stream completed (didn't timeout)
    expect(result).toBe("completed");

    // Assert: all non-billing events received
    expect(collectedEvents).toHaveLength(3);
    expect(collectedEvents[0]).toEqual({ type: "text_delta", delta: "Hello" });
    expect(collectedEvents[1]).toEqual({ type: "text_delta", delta: " world" });
    expect(collectedEvents[2]).toEqual({ type: "done" });

    // Assert: final resolves correctly
    const finalResult = await final;
    expect(finalResult.ok).toBe(true);
  });

  it("uiStream filters out usage_report events", async () => {
    // usage_report events are for billing only, not UI

    const events: AiEvent[] = [
      { type: "text_delta", delta: "Response" } satisfies TextDeltaEvent,
      {
        type: "usage_report",
        fact: {
          runId: "run-123",
          attempt: 0,
          source: "litellm",
          billingAccountId: "billing-123",
          virtualKeyId: "vk-123",
          inputTokens: 10,
          outputTokens: 5,
        },
      },
      { type: "done" } satisfies DoneEvent,
    ];

    const graphExecutor = createImmediateGraphExecutor(events);
    const accountService = createMockAccountServiceWithDefaults();

    const runtime = createAiRuntime({ graphExecutor, accountService });
    const ctx = createTestCtx();

    const { stream } = runtime.runChatStream(
      {
        messages: [createUserMessage("Test")],
        model: TEST_MODEL_ID,
        caller: {
          billingAccountId: "billing-123",
          virtualKeyId: "vk-123",
          requestId: ctx.reqId,
          traceId: ctx.traceId,
        },
      },
      ctx
    );

    const collectedEvents: AiEvent[] = [];
    for await (const event of stream) {
      collectedEvents.push(event);
    }

    // Assert: usage_report was filtered out
    expect(collectedEvents).toHaveLength(2);
    expect(collectedEvents.map((e) => e.type)).toEqual(["text_delta", "done"]);
  });

  it("uiStream completes when pump finishes with empty queue", async () => {
    // Edge case: pump finishes immediately with no UI events
    // (e.g., only usage_report then done, or error before any text)

    const events: AiEvent[] = [{ type: "done" } satisfies DoneEvent];

    const graphExecutor = createImmediateGraphExecutor(events);
    const accountService = createMockAccountServiceWithDefaults();

    const runtime = createAiRuntime({ graphExecutor, accountService });
    const ctx = createTestCtx();

    const { stream } = runtime.runChatStream(
      {
        messages: [createUserMessage("Test")],
        model: TEST_MODEL_ID,
        caller: {
          billingAccountId: "billing-123",
          virtualKeyId: "vk-123",
          requestId: ctx.reqId,
          traceId: ctx.traceId,
        },
      },
      ctx
    );

    const collectedEvents: AiEvent[] = [];

    // Should not hang even with minimal events
    const TIMEOUT_MS = 500;
    const timeoutPromise = new Promise<"timeout">((resolve) =>
      setTimeout(() => resolve("timeout"), TIMEOUT_MS)
    );

    const consumePromise = (async () => {
      for await (const event of stream) {
        collectedEvents.push(event);
      }
      return "completed";
    })();

    const result = await Promise.race([consumePromise, timeoutPromise]);

    expect(result).toBe("completed");
    expect(collectedEvents).toEqual([{ type: "done" }]);
  });
});
