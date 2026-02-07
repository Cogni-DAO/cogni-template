// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/unit/app/_facades/ai/completion.server`
 * Purpose: Contract test to ensure completion facade returns exact aiCompletionOperation.output shape.
 * Scope: Validates facade output matches contract schema to prevent drift between API/UI/tests. Does not test HTTP routing or real LLM calls.
 * Invariants: Facade output must always satisfy aiCompletionOperation.output.parse()
 * Side-effects: none
 * Notes: Uses reusable fixtures to ensure consistent test setup
 * Links: src/app/_facades/ai/completion.server.ts, src/contracts/ai.completion.v1.contract.ts
 * @public
 */

import { TEST_MODEL_ID, TEST_SESSION_USER_1 } from "@tests/_fakes";
import {
  createContainerMock,
  createGraphExecutorFactoryMock,
  createMockAiAdapterDeps,
  setupCompletionFacadeTest,
} from "@tests/_fixtures/ai/completion-facade-setup";
import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";

import { aiCompletionOperation } from "@/contracts/ai.completion.v1.contract";
import type { RequestContext } from "@/shared/observability";
import { makeNoopLogger } from "@/shared/observability";

// Mock serverEnv (following pattern from completion.test.ts)
vi.mock("@/shared/env", () => ({
  serverEnv: () => ({
    USER_PRICE_MARKUP_FACTOR: 1.5,
  }),
}));

describe("completion facade contract", () => {
  it("should return exact shape matching aiCompletionOperation.output", async () => {
    // Arrange - Use reusable fixture
    const { mockBillingAccount, clock } = setupCompletionFacadeTest();
    const mockDeps = createMockAiAdapterDeps();

    // Mock bootstrap container with proper AiAdapterDeps shape
    vi.doMock("@/bootstrap/container", () => createContainerMock(mockDeps));

    // Mock graph executor factory to avoid real LangGraph execution
    vi.doMock("@/bootstrap/graph-executor.factory", () =>
      createGraphExecutorFactoryMock()
    );

    // Mock auth mapping
    vi.doMock("@/lib/auth/mapping", () => ({
      getOrCreateBillingAccountForUser: vi
        .fn()
        .mockResolvedValue(mockBillingAccount),
    }));

    // Import after mocks are set up
    const { completion } = await import("@/app/_facades/ai/completion.server");

    const testCtx: RequestContext = {
      log: makeNoopLogger(),
      reqId: "test-req-123",
      traceId: "00000000000000000000000000000000",
      routeId: "test.route",
      clock,
    };

    // Act
    const result = await completion(
      {
        messages: [{ role: "user", content: "test" }],
        model: TEST_MODEL_ID,
        sessionUser: TEST_SESSION_USER_1,
        graphName: "langgraph:poet",
      },
      testCtx
    );

    // Assert - Result matches contract schema exactly
    expect(() => aiCompletionOperation.output.parse(result)).not.toThrow();

    // Assert - Validate structure
    const validated: z.infer<typeof aiCompletionOperation.output> = result;
    expect(validated.message.role).toBe("assistant");
    expect(validated.message.content).toBeTruthy();
    expect(validated.message.timestamp).toBe("2025-01-01T00:00:00.000Z");
  });

  it("should provide type safety via contract inference", async () => {
    // Arrange - Use reusable fixture
    const { mockBillingAccount, clock } = setupCompletionFacadeTest();
    const mockDeps = createMockAiAdapterDeps();

    // Mock bootstrap container with proper AiAdapterDeps shape
    vi.doMock("@/bootstrap/container", () => createContainerMock(mockDeps));

    // Mock graph executor factory to avoid real LangGraph execution
    vi.doMock("@/bootstrap/graph-executor.factory", () =>
      createGraphExecutorFactoryMock()
    );

    vi.doMock("@/lib/auth/mapping", () => ({
      getOrCreateBillingAccountForUser: vi
        .fn()
        .mockResolvedValue(mockBillingAccount),
    }));

    const { completion } = await import("@/app/_facades/ai/completion.server");

    const testCtx: RequestContext = {
      log: makeNoopLogger(),
      reqId: "test-req-456",
      traceId: "00000000000000000000000000000000",
      routeId: "test.route",
      clock,
    };

    // Act
    const result = await completion(
      {
        messages: [{ role: "user", content: "test" }],
        model: TEST_MODEL_ID,
        sessionUser: TEST_SESSION_USER_1,
        graphName: "langgraph:poet",
      },
      testCtx
    );

    // Assert - This should compile without errors - facade return type matches contract
    const _typeCheck: z.infer<typeof aiCompletionOperation.output> = result;

    // If this compiles, the facade signature is correct
    expect(_typeCheck).toBeDefined();
  });
});
