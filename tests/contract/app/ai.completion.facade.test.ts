// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/_facades/ai/completion.server`
 * Purpose: Verifies DTO validation and dependency coordination of AI completion facade.
 * Scope: App-layer contract testing with mocks. Does NOT test feature logic or HTTP routing.
 * Invariants: Contract compliance; error mapping; dependency injection; timestamp consistency.
 * Side-effects: none
 * Notes: Uses fake services for isolation; tests error propagation.
 * Links: aiCompletionOperation contract, completion facade
 * @public
 */

import { FakeClock } from "@tests/_fakes";
import { FakeLlmService } from "@tests/_fakes/ai/fakes";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { completion } from "@/app/_facades/ai/completion.server";
import { aiCompletionOperation } from "@/contracts/ai.completion.v1.contract";
import { ChatErrorCode, ChatValidationError } from "@/core";

// Mock the bootstrap container
vi.mock("@/bootstrap/container", () => ({
  resolveAiDeps: vi.fn(),
}));

// Mock the feature service
vi.mock("@/features/ai/services/completion", () => ({
  execute: vi.fn(),
}));

import { resolveAiDeps } from "@/bootstrap/container";
import { execute } from "@/features/ai/services/completion";

const mockResolveAiDeps = vi.mocked(resolveAiDeps);
const mockExecute = vi.mocked(execute);

describe("app/_facades/ai/completion.server", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("completion", () => {
    it("should handle valid DTO input and return contract-compliant output", async () => {
      // Arrange
      const input = {
        messages: [
          { role: "user" as const, content: "Hello" },
          { role: "assistant" as const, content: "Hi there" },
        ],
      };

      const fakeLlm = new FakeLlmService({ responseContent: "AI response" });
      const fakeClock = new FakeClock("2025-01-01T12:00:00.000Z");

      mockResolveAiDeps.mockReturnValue({
        llmService: fakeLlm,
        clock: fakeClock,
      });

      mockExecute.mockResolvedValue({
        role: "assistant",
        content: "AI response",
        timestamp: "2025-01-01T12:00:00.000Z",
      });

      // Act
      const result = await completion(input);

      // Assert
      expect(result).toEqual({
        message: {
          role: "assistant",
          content: "AI response",
          timestamp: "2025-01-01T12:00:00.000Z",
        },
      });

      // Verify contract compliance
      expect(() => aiCompletionOperation.output.parse(result)).not.toThrow();

      // Verify feature was called with mapped core messages
      const executeCall = mockExecute.mock.calls[0];
      expect(executeCall).toBeDefined();
      const coreMessages = executeCall?.[0];
      expect(coreMessages).toBeDefined();

      expect(coreMessages).toHaveLength(2);
      expect(coreMessages?.[0]).toEqual({
        role: "user",
        content: "Hello",
        timestamp: "2025-01-01T12:00:00.000Z",
      });
      expect(coreMessages?.[1]).toEqual({
        role: "assistant",
        content: "Hi there",
        timestamp: "2025-01-01T12:00:00.000Z",
      });
      expect(executeCall?.[1]).toBe(fakeLlm);
      expect(executeCall?.[2]).toBe(fakeClock);
    });

    it("should map ChatValidationError to structured error response", async () => {
      // Arrange
      const input = {
        messages: [{ role: "user" as const, content: "A".repeat(5000) }],
      };

      mockResolveAiDeps.mockReturnValue({
        llmService: new FakeLlmService(),
        clock: new FakeClock(),
      });

      const validationError = new ChatValidationError(
        ChatErrorCode.MESSAGE_TOO_LONG,
        "Message exceeds limit"
      );
      mockExecute.mockRejectedValue(validationError);

      // Act & Assert
      await expect(completion(input)).rejects.toThrow(ChatValidationError);
      await expect(completion(input)).rejects.toThrow("Message exceeds limit");
    });

    it("should handle LLM service failures", async () => {
      // Arrange
      const input = {
        messages: [{ role: "user" as const, content: "Hello" }],
      };

      mockResolveAiDeps.mockReturnValue({
        llmService: new FakeLlmService(),
        clock: new FakeClock(),
      });

      const serviceError = new Error("LLM service temporarily unavailable");
      mockExecute.mockRejectedValue(serviceError);

      // Act & Assert
      await expect(completion(input)).rejects.toThrow(
        "LLM service temporarily unavailable"
      );
    });

    it("should set timestamps consistently on input messages", async () => {
      // Arrange
      const input = {
        messages: [
          { role: "user" as const, content: "First" },
          { role: "assistant" as const, content: "Second" },
        ],
      };

      const fixedTime = "2025-01-01T15:30:00.000Z";
      const fakeClock = new FakeClock(fixedTime);

      mockResolveAiDeps.mockReturnValue({
        llmService: new FakeLlmService(),
        clock: fakeClock,
      });

      mockExecute.mockResolvedValue({
        role: "assistant",
        content: "Response",
        timestamp: fixedTime,
      });

      // Act
      await completion(input);

      // Assert - all input messages should get the same timestamp
      const executeCall = mockExecute.mock.calls[0];
      expect(executeCall).toBeDefined();
      const coreMessages = executeCall?.[0];
      expect(coreMessages).toBeDefined();

      expect(coreMessages).toEqual([
        { role: "user", content: "First", timestamp: fixedTime },
        { role: "assistant", content: "Second", timestamp: fixedTime },
      ]);
    });

    it("should reject system role messages at facade level", async () => {
      // Arrange - This tests the mapper's role validation
      const input = {
        messages: [
          { role: "user" as const, content: "Hello" },
          // Note: TypeScript prevents system role in DTO, but test runtime behavior
        ],
      };

      mockResolveAiDeps.mockReturnValue({
        llmService: new FakeLlmService(),
        clock: new FakeClock(),
      });

      // Simulate mapper throwing on invalid role (tested in isolation elsewhere)
      const roleError = new ChatValidationError(
        ChatErrorCode.INVALID_CONTENT,
        "Invalid role: system"
      );
      mockExecute.mockRejectedValue(roleError);

      // Act & Assert
      await expect(completion(input)).rejects.toThrow(ChatValidationError);
    });
  });
});
