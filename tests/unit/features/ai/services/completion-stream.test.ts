// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/unit/features/ai/services/completion-stream.test`
 * Purpose: Unit tests for the streaming execution path in the completion feature service.
 * Scope: Verifies orchestration of streaming, atomic billing, and event propagation. Does not test real LLM integration.
 * Invariants: Billing must occur exactly once at the end of the stream.
 * Side-effects: none
 * Links: Tests executeStream in completion.ts
 * @internal
 */

import {
  createMockAccountServiceWithDefaults,
  createUserMessage,
  FakeClock,
  FakeLlmService,
  TEST_MODEL_ID,
} from "@tests/_fakes";
import { describe, expect, it, vi } from "vitest";

import { executeStream } from "@/features/ai/services/completion";
import type { LlmCaller } from "@/ports";
import type { RequestContext } from "@/shared/observability";
import { makeNoopLogger } from "@/shared/observability";

// Mock serverEnv
vi.mock("@/shared/env", () => ({
  serverEnv: () => ({
    CREDITS_PER_USDC: 1000,
    USER_PRICE_MARKUP_FACTOR: 1.5,
  }),
}));

describe("features/ai/services/completion (stream)", () => {
  const createTestCaller = (): LlmCaller => ({
    billingAccountId: "billing-test-user",
    virtualKeyId: "virtual-key-123",
    litellmVirtualKey: "vk-test-key",
  });

  it("should orchestrate streaming flow and bill on completion", async () => {
    // Arrange
    const messages = [createUserMessage("Hello")];
    const llmService = new FakeLlmService({
      responseContent: "Streamed response",
    });
    const clock = new FakeClock("2025-01-01T12:00:00.000Z");
    const caller = createTestCaller();
    const testCtx: RequestContext = {
      log: makeNoopLogger(),
      reqId: "test-req-123",
      routeId: "test.route",
      clock,
    };
    const accountService = createMockAccountServiceWithDefaults();

    // Act
    const { stream, final } = await executeStream({
      messages,
      model: TEST_MODEL_ID,
      llmService,
      accountService,
      clock,
      caller,
      ctx: testCtx,
    });

    // Consume stream
    const chunks: string[] = [];
    for await (const event of stream) {
      if (event.type === "text_delta") {
        chunks.push(event.delta);
      }
    }

    const result = await final;

    // Assert
    expect(chunks).toEqual(["Streamed response"]);
    expect(result.message).toEqual({
      role: "assistant",
      content: "Streamed response",
      timestamp: "2025-01-01T12:00:00.000Z",
    });
    expect(result.requestId).toBeDefined();

    // Verify charge receipt recorded (per ACTIVITY_METRICS.md)
    expect(accountService.recordChargeReceipt).toHaveBeenCalledTimes(1);
    const mockCalls = vi.mocked(accountService.recordChargeReceipt).mock.calls;
    expect(mockCalls.length).toBeGreaterThan(0);
    const billingCall = mockCalls[0]?.[0];
    expect(billingCall).toBeDefined();
    expect(billingCall).toMatchObject({
      billingAccountId: "billing-test-user",
      requestId: result.requestId, // Idempotency check
      provenance: "stream", // Streaming completion
    });
  });
});
