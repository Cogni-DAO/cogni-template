// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/_facades/ai/completion.server`
 * Purpose: Verifies DTO validation and dependency coordination of AI completion facade.
 * Scope: App-layer contract testing with mocks. Does NOT test feature logic or HTTP routing.
 * Invariants:
 *   - Contract compliance; error mapping; dependency injection; timestamp consistency.
 *   - UNIFIED_GRAPH_EXECUTOR: All execution flows through GraphExecutorPort.runGraph()
 * Side-effects: none
 * Notes: Uses fake services for isolation; mocks GraphExecutor at bootstrap boundary.
 * Links: aiCompletionOperation contract, completion facade, GRAPH_EXECUTION.md
 * @public
 */

import {
  createMockAccountServiceWithDefaults,
  FakeAiTelemetryAdapter,
  FakeClock,
} from "@tests/_fakes";
import { TEST_MODEL_ID } from "@tests/_fakes/ai/fakes";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { completion } from "@/app/_facades/ai/completion.server";
import { aiCompletionOperation } from "@/contracts/ai.completion.v1.contract";
import type {
  GraphExecutorPort,
  GraphRunRequest,
  GraphRunResult,
} from "@/ports";
import type { SessionUser } from "@/shared/auth";
import type { RequestContext } from "@/shared/observability";
import { makeNoopLogger } from "@/shared/observability";
import type { AiEvent } from "@/types/ai-events";

// Mock the bootstrap container
vi.mock("@/bootstrap/container", () => ({
  resolveAiAdapterDeps: vi.fn(),
}));

// Mock the graph executor factory (stable boundary per UNIFIED_GRAPH_EXECUTOR)
vi.mock("@/bootstrap/graph-executor.factory", () => ({
  createInProcGraphExecutor: vi.fn(),
}));

import { resolveAiAdapterDeps } from "@/bootstrap/container";
import { createInProcGraphExecutor } from "@/bootstrap/graph-executor.factory";

const mockResolveAiAdapterDeps = vi.mocked(resolveAiAdapterDeps);
const mockCreateInProcGraphExecutor = vi.mocked(createInProcGraphExecutor);

/**
 * Create a fake GraphExecutorPort for testing.
 * Emits a simple stream with text_delta and done events.
 */
function createFakeGraphExecutor(options: {
  responseContent: string;
  requestId: string;
}): GraphExecutorPort & { runGraphSpy: ReturnType<typeof vi.fn> } {
  const runGraphSpy = vi.fn();

  const executor: GraphExecutorPort = {
    runGraph(req: GraphRunRequest): GraphRunResult {
      runGraphSpy(req);

      // Create async generator for stream
      async function* createStream(): AsyncIterable<AiEvent> {
        yield { type: "text_delta", delta: options.responseContent };
        yield { type: "done" };
      }

      // Create final promise
      const final = Promise.resolve({
        ok: true as const,
        runId: req.runId,
        requestId: options.requestId,
        usage: { promptTokens: 10, completionTokens: 20 },
        finishReason: "stop",
      });

      return { stream: createStream(), final };
    },
  };

  return { ...executor, runGraphSpy };
}

describe("app/_facades/ai/completion.server", () => {
  const sessionUser: SessionUser = {
    id: "test-user",
    walletAddress: "0xabc123",
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("completion", () => {
    it("should handle valid DTO input and return contract-compliant output via GraphExecutorPort", async () => {
      // Arrange
      const input = {
        messages: [
          { role: "user" as const, content: "Hello" },
          { role: "assistant" as const, content: "Hi there" },
        ],
        model: TEST_MODEL_ID,
        sessionUser,
      };

      const fakeClock = new FakeClock("2025-01-01T12:00:00.000Z");
      const mockAccountService = createMockAccountServiceWithDefaults();

      mockResolveAiAdapterDeps.mockReturnValue({
        llmService: {} as never, // Not used in streaming path
        accountService: mockAccountService,
        clock: fakeClock,
        aiTelemetry: new FakeAiTelemetryAdapter(),
        langfuse: undefined,
      });

      // Create fake executor with spy
      const fakeExecutor = createFakeGraphExecutor({
        responseContent: "AI response",
        requestId: "req-123",
      });
      mockCreateInProcGraphExecutor.mockReturnValue(fakeExecutor);

      const testCtx: RequestContext = {
        log: makeNoopLogger(),
        reqId: "test-req-123",
        traceId: "00000000000000000000000000000000",
        routeId: "test.route",
        clock: fakeClock,
      };

      // Act
      const result = await completion(input, testCtx);

      // Assert - CRITICAL: GraphExecutorPort.runGraph() MUST be called
      expect(fakeExecutor.runGraphSpy).toHaveBeenCalledTimes(1);
      const runGraphCall = fakeExecutor.runGraphSpy.mock
        .calls[0]?.[0] as GraphRunRequest;
      expect(runGraphCall).toBeDefined();
      expect(runGraphCall.runId).toBe("test-req-123"); // P0: runId = ctx.reqId
      expect(runGraphCall.ingressRequestId).toBe("test-req-123");
      expect(runGraphCall.model).toBe(TEST_MODEL_ID);
      expect(runGraphCall.messages).toHaveLength(2);

      // Verify contract-compliant output
      expect(result).toEqual({
        message: {
          role: "assistant",
          content: "AI response",
          timestamp: "2025-01-01T12:00:00.000Z",
          requestId: "req-123",
        },
      });

      // Verify contract compliance
      expect(() => aiCompletionOperation.output.parse(result)).not.toThrow();

      // Verify billing account lookup
      expect(
        mockAccountService.getOrCreateBillingAccountForUser
      ).toHaveBeenCalledWith({
        userId: sessionUser.id,
        walletAddress: sessionUser.walletAddress,
      });
    });

    it("should propagate errors from GraphExecutorPort final result", async () => {
      // Arrange
      const input = {
        messages: [{ role: "user" as const, content: "Hello" }],
        model: TEST_MODEL_ID,
        sessionUser,
      };

      const fakeClock = new FakeClock();
      const mockAccountService = createMockAccountServiceWithDefaults();

      mockResolveAiAdapterDeps.mockReturnValue({
        llmService: {} as never,
        accountService: mockAccountService,
        clock: fakeClock,
        aiTelemetry: new FakeAiTelemetryAdapter(),
        langfuse: undefined,
      });

      // Create executor that returns error result
      const errorExecutor: GraphExecutorPort = {
        runGraph(req: GraphRunRequest): GraphRunResult {
          async function* createStream(): AsyncIterable<AiEvent> {
            yield { type: "done" };
          }

          return {
            stream: createStream(),
            final: Promise.resolve({
              ok: false as const,
              runId: req.runId,
              requestId: "req-err",
              error: "internal" as const,
            }),
          };
        },
      };
      mockCreateInProcGraphExecutor.mockReturnValue(errorExecutor);

      const testCtx: RequestContext = {
        log: makeNoopLogger(),
        reqId: "test-req-123",
        traceId: "00000000000000000000000000000000",
        routeId: "test.route",
        clock: fakeClock,
      };

      // Act & Assert
      await expect(completion(input, testCtx)).rejects.toThrow(
        "Completion failed: internal"
      );
    });

    it("should use factory to create graph executor", async () => {
      // Arrange
      const input = {
        messages: [{ role: "user" as const, content: "Hello" }],
        model: TEST_MODEL_ID,
        sessionUser,
      };

      const fakeClock = new FakeClock();
      const mockAccountService = createMockAccountServiceWithDefaults();

      mockResolveAiAdapterDeps.mockReturnValue({
        llmService: {} as never,
        accountService: mockAccountService,
        clock: fakeClock,
        aiTelemetry: new FakeAiTelemetryAdapter(),
        langfuse: undefined,
      });

      const fakeExecutor = createFakeGraphExecutor({
        responseContent: "Response",
        requestId: "req-456",
      });
      mockCreateInProcGraphExecutor.mockReturnValue(fakeExecutor);

      const testCtx: RequestContext = {
        log: makeNoopLogger(),
        reqId: "test-req-123",
        traceId: "00000000000000000000000000000000",
        routeId: "test.route",
        clock: fakeClock,
      };

      // Act
      await completion(input, testCtx);

      // Assert - Factory must be called to create executor
      expect(mockCreateInProcGraphExecutor).toHaveBeenCalledTimes(1);
    });

    it("should set timestamps consistently from clock", async () => {
      // Arrange
      const input = {
        messages: [
          { role: "user" as const, content: "First" },
          { role: "assistant" as const, content: "Second" },
        ],
        model: TEST_MODEL_ID,
        sessionUser,
      };

      const fixedTime = "2025-01-01T15:30:00.000Z";
      const fakeClock = new FakeClock(fixedTime);
      const mockAccountService = createMockAccountServiceWithDefaults();

      mockResolveAiAdapterDeps.mockReturnValue({
        llmService: {} as never,
        accountService: mockAccountService,
        clock: fakeClock,
        aiTelemetry: new FakeAiTelemetryAdapter(),
        langfuse: undefined,
      });

      const fakeExecutor = createFakeGraphExecutor({
        responseContent: "Response",
        requestId: "req-456",
      });
      mockCreateInProcGraphExecutor.mockReturnValue(fakeExecutor);

      const testCtx: RequestContext = {
        log: makeNoopLogger(),
        reqId: "test-req-123",
        traceId: "00000000000000000000000000000000",
        routeId: "test.route",
        clock: fakeClock,
      };

      // Act
      const result = await completion(input, testCtx);

      // Assert - Output timestamp should use clock
      expect(result.message.timestamp).toBe(fixedTime);
    });
  });
});
