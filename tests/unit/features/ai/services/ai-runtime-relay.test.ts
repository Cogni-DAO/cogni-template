// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/unit/features/ai/services/ai-runtime-relay.test`
 * Purpose: Unit tests for RunEventRelay race conditions and billing validation in ai_runtime.ts
 * Scope: Tests protocol termination, billing validation (strict/hints schemas), and terminal guard. Does not test actual DB writes or stack-level integration.
 * Invariants: BILLING_INDEPENDENT_OF_CLIENT, USAGE_FACT_VALIDATED, TERMINAL_ONCE
 * Side-effects: none
 * Links: Tests RunEventRelay in ai_runtime.ts, GRAPH_EXECUTION.md
 * @internal
 */

import {
  buildExternalUsageFact,
  buildInprocUsageFact,
  buildSandboxUsageFact,
  createDelayedReturnGraphExecutor,
  createImmediateGraphExecutor,
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
import type {
  AiEvent,
  DoneEvent,
  ErrorEvent,
  TextDeltaEvent,
  UsageReportEvent,
} from "@/types/ai-events";
import type { UsageFact } from "@/types/usage";

// Mock serverEnv
vi.mock("@/shared/env", () => ({
  serverEnv: () => ({
    USER_PRICE_MARKUP_FACTOR: 1.5,
  }),
}));

// Mock isModelFree for billing commit tests
vi.mock("@/shared/ai/model-catalog.server", () => ({
  isModelFree: vi.fn().mockResolvedValue(true),
}));

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const createTestCtx = (): RequestContext => ({
  log: makeNoopLogger(),
  reqId: "test-req-123",
  traceId: "00000000000000000000000000000000",
  routeId: "test.route",
  clock: new FakeClock("2025-01-01T12:00:00.000Z"),
});

const defaultInput = (ctx: RequestContext) => ({
  messages: [createUserMessage("Test")],
  model: TEST_MODEL_ID,
  graphName: "langgraph:poet",
  caller: {
    billingAccountId: "billing-123",
    virtualKeyId: "vk-123",
    requestId: ctx.reqId,
    traceId: ctx.traceId,
  },
});

/** Collect all events from stream with a timeout to detect hangs. */
async function consumeWithTimeout(
  stream: AsyncIterable<AiEvent>,
  timeoutMs = 1000
): Promise<{ result: "completed" | "timeout"; events: AiEvent[] }> {
  const events: AiEvent[] = [];
  const consumePromise = (async () => {
    for await (const event of stream) {
      events.push(event);
    }
    return "completed" as const;
  })();
  const timeoutPromise = new Promise<"timeout">((r) =>
    setTimeout(() => r("timeout"), timeoutMs)
  );
  const result = await Promise.race([consumePromise, timeoutPromise]);
  return { result, events };
}

// ============================================================================
// RunEventRelay: Race Conditions
// ============================================================================

describe("RunEventRelay race conditions", () => {
  it("uiStream terminates on done event BEFORE pumpDone is set", async () => {
    // CRITICAL: This test verifies that uiStream terminates on the done event
    // itself, NOT by waiting for pumpDone to flip. The upstream continues
    // for 500ms after yielding done, so if uiStream waits for pumpDone, it hangs.

    const events: AiEvent[] = [
      { type: "text_delta", delta: "Hello" } satisfies TextDeltaEvent,
      { type: "done" } satisfies DoneEvent,
    ];

    // Upstream delays 500ms after done before returning (pumpDone not set yet)
    const graphExecutor = createDelayedReturnGraphExecutor(events, 500);
    const accountService = createMockAccountServiceWithDefaults();

    const runtime = createAiRuntime({ graphExecutor, accountService });
    const ctx = createTestCtx();

    const { stream } = runtime.runChatStream(defaultInput(ctx), ctx);

    const TIMEOUT_MS = 200;
    const startMs = performance.now();
    const { result, events: collectedEvents } = await consumeWithTimeout(
      stream,
      TIMEOUT_MS
    );
    const elapsedMs = performance.now() - startMs;

    // Assert: completed (didn't timeout waiting for pumpDone)
    expect(result).toBe("completed");
    // Assert: completed quickly (< 200ms, not waiting for 500ms delay)
    expect(elapsedMs).toBeLessThan(TIMEOUT_MS);
    // Assert: received all events
    expect(collectedEvents).toHaveLength(2);
    expect(collectedEvents[1]).toEqual({ type: "done" });
  });

  it("uiStream terminates on error event", async () => {
    // Error events are also terminal - uiStream should return immediately

    const events: AiEvent[] = [
      { type: "text_delta", delta: "Partial" } satisfies TextDeltaEvent,
      { type: "error", error: "internal" } satisfies ErrorEvent,
    ];

    const graphExecutor = createImmediateGraphExecutor(events);
    const accountService = createMockAccountServiceWithDefaults();

    const runtime = createAiRuntime({ graphExecutor, accountService });
    const ctx = createTestCtx();

    const { stream } = runtime.runChatStream(defaultInput(ctx), ctx);

    const collectedEvents: AiEvent[] = [];
    for await (const event of stream) {
      collectedEvents.push(event);
    }

    // Assert: terminated on error
    expect(collectedEvents).toHaveLength(2);
    expect(collectedEvents[0]).toEqual({
      type: "text_delta",
      delta: "Partial",
    });
    expect(collectedEvents[1]).toEqual({
      type: "error",
      error: "internal",
    });
  });

  it("uiStream does not hang when pump finishes immediately after done event", async () => {
    const events: AiEvent[] = [
      { type: "text_delta", delta: "Hello" } satisfies TextDeltaEvent,
      { type: "text_delta", delta: " world" } satisfies TextDeltaEvent,
      { type: "done" } satisfies DoneEvent,
    ];

    const graphExecutor = createImmediateGraphExecutor(events);
    const accountService = createMockAccountServiceWithDefaults();

    const runtime = createAiRuntime({ graphExecutor, accountService });
    const ctx = createTestCtx();

    const { stream, final } = runtime.runChatStream(defaultInput(ctx), ctx);

    const { result, events: collectedEvents } =
      await consumeWithTimeout(stream);

    expect(result).toBe("completed");
    expect(collectedEvents).toHaveLength(3);
    expect(collectedEvents[0]).toEqual({ type: "text_delta", delta: "Hello" });
    expect(collectedEvents[1]).toEqual({
      type: "text_delta",
      delta: " world",
    });
    expect(collectedEvents[2]).toEqual({ type: "done" });

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

    const { stream } = runtime.runChatStream(defaultInput(ctx), ctx);

    const collectedEvents: AiEvent[] = [];
    for await (const event of stream) {
      collectedEvents.push(event);
    }

    // Assert: usage_report was filtered out
    expect(collectedEvents).toHaveLength(2);
    expect(collectedEvents.map((e) => e.type)).toEqual(["text_delta", "done"]);
  });

  it("uiStream completes when pump finishes with empty queue", async () => {
    const events: AiEvent[] = [{ type: "done" } satisfies DoneEvent];

    const graphExecutor = createImmediateGraphExecutor(events);
    const accountService = createMockAccountServiceWithDefaults();

    const runtime = createAiRuntime({ graphExecutor, accountService });
    const ctx = createTestCtx();

    const { stream } = runtime.runChatStream(defaultInput(ctx), ctx);

    const { result, events: collectedEvents } = await consumeWithTimeout(
      stream,
      500
    );

    expect(result).toBe("completed");
    expect(collectedEvents).toEqual([{ type: "done" }]);
  });
});

// ============================================================================
// RunEventRelay: Billing Validation
// ============================================================================

describe("RunEventRelay billing validation", () => {
  it("inproc executor missing usageUnitId → error event in stream (billing failed)", async () => {
    // A billing-authoritative executor (inproc) with missing usageUnitId
    // should fail strict schema validation → throw → error event in stream
    const { usageUnitId: _, ...factWithoutId } = buildInprocUsageFact();

    const events: AiEvent[] = [
      { type: "text_delta", delta: "Hello" } satisfies TextDeltaEvent,
      {
        type: "usage_report",
        fact: factWithoutId as unknown as UsageFact,
      } satisfies UsageReportEvent,
      { type: "done" } satisfies DoneEvent,
    ];

    const graphExecutor = createImmediateGraphExecutor(events);
    const accountService = createMockAccountServiceWithDefaults();
    const runtime = createAiRuntime({ graphExecutor, accountService });
    const ctx = createTestCtx();

    const { stream } = runtime.runChatStream(defaultInput(ctx), ctx);
    const { result, events: collectedEvents } =
      await consumeWithTimeout(stream);

    expect(result).toBe("completed");
    // text_delta was queued before the usage_report caused the error
    expect(collectedEvents[0]).toEqual({ type: "text_delta", delta: "Hello" });
    // error event should be emitted by pump's catch handler
    expect(collectedEvents.some((e) => e.type === "error")).toBe(true);
    // recordChargeReceipt should NOT have been called (validation failed before billing)
    expect(accountService.recordChargeReceipt).not.toHaveBeenCalled();
  });

  it("sandbox executor missing usageUnitId → error event in stream (billing failed)", async () => {
    const { usageUnitId: _, ...factWithoutId } = buildSandboxUsageFact();

    const events: AiEvent[] = [
      {
        type: "usage_report",
        fact: factWithoutId as unknown as UsageFact,
      } satisfies UsageReportEvent,
      { type: "done" } satisfies DoneEvent,
    ];

    const graphExecutor = createImmediateGraphExecutor(events);
    const accountService = createMockAccountServiceWithDefaults();
    const runtime = createAiRuntime({ graphExecutor, accountService });
    const ctx = createTestCtx();

    const { stream } = runtime.runChatStream(defaultInput(ctx), ctx);

    const collectedEvents: AiEvent[] = [];
    for await (const event of stream) {
      collectedEvents.push(event);
    }

    expect(collectedEvents.some((e) => e.type === "error")).toBe(true);
    expect(accountService.recordChargeReceipt).not.toHaveBeenCalled();
  });

  it("external executor missing usageUnitId → no error, billing skipped", async () => {
    // External (langgraph_server) with missing usageUnitId should pass hints
    // schema validation but skip billing commit (soft warn, not error)
    const externalFact = buildExternalUsageFact();

    const events: AiEvent[] = [
      { type: "text_delta", delta: "Response" } satisfies TextDeltaEvent,
      { type: "usage_report", fact: externalFact } satisfies UsageReportEvent,
      { type: "done" } satisfies DoneEvent,
    ];

    const graphExecutor = createImmediateGraphExecutor(events);
    const accountService = createMockAccountServiceWithDefaults();
    const runtime = createAiRuntime({ graphExecutor, accountService });
    const ctx = createTestCtx();

    const { stream } = runtime.runChatStream(defaultInput(ctx), ctx);

    const collectedEvents: AiEvent[] = [];
    for await (const event of stream) {
      collectedEvents.push(event);
    }

    // No error in stream — soft skip, not hard failure
    expect(collectedEvents.map((e) => e.type)).toEqual(["text_delta", "done"]);
    // recordChargeReceipt NOT called (usageUnitId missing → commitUsageFact skips)
    expect(accountService.recordChargeReceipt).not.toHaveBeenCalled();
  });

  it("valid inproc usage_report → commitUsageFact calls recordChargeReceipt", async () => {
    const fact = buildInprocUsageFact();

    const events: AiEvent[] = [
      { type: "text_delta", delta: "Response" } satisfies TextDeltaEvent,
      { type: "usage_report", fact } satisfies UsageReportEvent,
      { type: "done" } satisfies DoneEvent,
    ];

    const graphExecutor = createImmediateGraphExecutor(events);
    const accountService = createMockAccountServiceWithDefaults();
    const runtime = createAiRuntime({ graphExecutor, accountService });
    const ctx = createTestCtx();

    const { stream } = runtime.runChatStream(defaultInput(ctx), ctx);

    const collectedEvents: AiEvent[] = [];
    for await (const event of stream) {
      collectedEvents.push(event);
    }

    // Stream completes normally (no error)
    expect(collectedEvents.map((e) => e.type)).toEqual(["text_delta", "done"]);

    // Wait a tick for async billing to complete
    await new Promise((r) => setTimeout(r, 50));

    // recordChargeReceipt was called (billing committed)
    expect(accountService.recordChargeReceipt).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(accountService.recordChargeReceipt).mock
      .calls[0]?.[0];
    expect(callArgs.sourceReference).toContain("litellm-call-id-456");
  });
});

// ============================================================================
// RunEventRelay: Terminal Guard (Protocol Violation Handling)
// ============================================================================

describe("RunEventRelay terminal guard", () => {
  it("ignores events after terminal done (protocol violation)", async () => {
    const events: AiEvent[] = [
      { type: "text_delta", delta: "Hello" } satisfies TextDeltaEvent,
      { type: "done" } satisfies DoneEvent,
      // Protocol violation: events after done should be ignored
      {
        type: "text_delta",
        delta: "SHOULD BE IGNORED",
      } satisfies TextDeltaEvent,
    ];

    const graphExecutor: GraphExecutorPort = {
      runGraph(_req: GraphRunRequest): GraphRunResult {
        async function* stream(): AsyncIterable<AiEvent> {
          for (const event of events) {
            yield event;
          }
        }
        return {
          stream: stream(),
          final: Promise.resolve({
            ok: true as const,
            runId: "run-123",
            requestId: "req-123",
          }),
        };
      },
    };

    const accountService = createMockAccountServiceWithDefaults();
    const runtime = createAiRuntime({ graphExecutor, accountService });
    const ctx = createTestCtx();

    const { stream } = runtime.runChatStream(defaultInput(ctx), ctx);

    const collectedEvents: AiEvent[] = [];
    for await (const event of stream) {
      collectedEvents.push(event);
    }

    // Only "Hello" and "done" should be collected — "SHOULD BE IGNORED" is dropped
    expect(collectedEvents).toHaveLength(2);
    expect(collectedEvents[0]).toEqual({ type: "text_delta", delta: "Hello" });
    expect(collectedEvents[1]).toEqual({ type: "done" });
  });

  it("ignores usage_report after terminal done (no billing for post-done events)", async () => {
    const fact = buildInprocUsageFact();

    const events: AiEvent[] = [
      { type: "done" } satisfies DoneEvent,
      // Protocol violation: usage_report after done
      { type: "usage_report", fact } satisfies UsageReportEvent,
    ];

    const graphExecutor: GraphExecutorPort = {
      runGraph(_req: GraphRunRequest): GraphRunResult {
        async function* stream(): AsyncIterable<AiEvent> {
          for (const event of events) {
            yield event;
          }
        }
        return {
          stream: stream(),
          final: Promise.resolve({
            ok: true as const,
            runId: "run-123",
            requestId: "req-123",
          }),
        };
      },
    };

    const accountService = createMockAccountServiceWithDefaults();
    const runtime = createAiRuntime({ graphExecutor, accountService });
    const ctx = createTestCtx();

    const { stream } = runtime.runChatStream(defaultInput(ctx), ctx);

    const collectedEvents: AiEvent[] = [];
    for await (const event of stream) {
      collectedEvents.push(event);
    }

    // Wait for pump to finish
    await new Promise((r) => setTimeout(r, 50));

    // Only done should be collected
    expect(collectedEvents).toEqual([{ type: "done" }]);
    // Billing should NOT have been called (usage_report was after terminal)
    expect(accountService.recordChargeReceipt).not.toHaveBeenCalled();
  });
});
