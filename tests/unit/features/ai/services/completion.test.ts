// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/ai/services/completion`
 * Purpose: Verifies AI completion orchestration with message processing and LLM coordination.
 * Scope: Feature service testing with mocks. Does NOT test real LLM or HTTP integration.
 * Invariants: Message filtering; history trimming; error propagation; timestamp injection.
 * Side-effects: none
 * Notes: Uses fake services for deterministic testing; covers validation failures.
 * Links: completion execute function, LlmService port
 * @public
 */

import { createMockAccountServiceWithDefaults, FakeClock } from "@tests/_fakes";
import {
  createConversation,
  createLongMessage,
  createMixedRoleConversation,
  createUserMessage,
  FakeLlmService,
} from "@tests/_fakes/ai/fakes";
import { describe, expect, it } from "vitest";

import { ChatValidationError, MAX_MESSAGE_CHARS } from "@/core";
import { execute } from "@/features/ai/services/completion";
import type { LlmCaller } from "@/ports";

describe("features/ai/services/completion", () => {
  // Helper to create test caller
  const createTestCaller = (): LlmCaller => ({
    billingAccountId: "billing-test-user",
    virtualKeyId: "virtual-key-123",
    litellmVirtualKey: "vk-test-key",
  });

  describe("execute", () => {
    it("should orchestrate completion flow for valid messages", async () => {
      // Arrange
      const messages = createConversation("Hello", "Hi");
      const llmService = new FakeLlmService({ responseContent: "AI response" });
      const clock = new FakeClock("2025-01-01T12:00:00.000Z");
      const caller = createTestCaller();

      // Act
      const accountService = createMockAccountServiceWithDefaults();
      const result = await execute(
        messages,
        llmService,
        accountService,
        clock,
        caller
      );

      // Assert
      expect(result).toEqual({
        role: "assistant",
        content: "AI response",
        timestamp: "2025-01-01T12:00:00.000Z",
      });
      expect(llmService.wasCalled()).toBe(true);
      expect(llmService.getLastCall()?.messages).toHaveLength(2); // user + assistant
    });

    it("should filter system messages before calling LLM", async () => {
      // Arrange
      const messages = createMixedRoleConversation(); // includes system messages
      const llmService = new FakeLlmService();
      const clock = new FakeClock();
      const caller = createTestCaller();

      // Act
      const accountService = createMockAccountServiceWithDefaults();
      await execute(messages, llmService, accountService, clock, caller);

      // Assert
      const lastCall = llmService.getLastCall();
      expect(lastCall?.messages).toHaveLength(3); // only user + assistant messages
      expect(lastCall?.messages.every((m) => m.role !== "system")).toBe(true);
    });

    it("should throw ChatValidationError for messages exceeding length limit", async () => {
      // Arrange
      const messages = [createLongMessage(MAX_MESSAGE_CHARS + 1)];
      const llmService = new FakeLlmService();
      const clock = new FakeClock();
      const caller = createTestCaller();

      // Act & Assert
      const accountService = createMockAccountServiceWithDefaults();
      await expect(
        execute(messages, llmService, accountService, clock, caller)
      ).rejects.toThrow(ChatValidationError);
      expect(llmService.wasCalled()).toBe(false); // Should not call LLM
    });

    it("should apply conversation history trimming", async () => {
      // Arrange - create messages that exceed total limit
      const messages = [
        createLongMessage(2000, "user"), // Will be trimmed
        createLongMessage(2000, "assistant"), // Will be trimmed
        createLongMessage(2000, "user"), // Will be kept
        createLongMessage(1000, "assistant"), // Will be kept
      ];
      const llmService = new FakeLlmService();
      const clock = new FakeClock();
      const caller = createTestCaller();

      // Act
      const accountService = createMockAccountServiceWithDefaults();
      await execute(messages, llmService, accountService, clock, caller);

      // Assert - should trim to fit MAX_MESSAGE_CHARS (4000)
      const lastCall = llmService.getLastCall();
      expect(lastCall?.messages.length).toBeLessThan(4);

      // Calculate total length of passed messages
      const totalLength =
        lastCall?.messages.reduce((sum, msg) => {
          return sum + Array.from(msg.content).length;
        }, 0) ?? 0;
      expect(totalLength).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);
    });

    it("should not mutate original messages array", async () => {
      // Arrange
      const originalMessages = createMixedRoleConversation();
      const messagesCopy = JSON.parse(JSON.stringify(originalMessages));
      const llmService = new FakeLlmService();
      const clock = new FakeClock();
      const caller = createTestCaller();

      // Act
      const accountService = createMockAccountServiceWithDefaults();
      await execute(
        originalMessages,
        llmService,
        accountService,
        clock,
        caller
      );

      // Assert
      expect(originalMessages).toEqual(messagesCopy);
    });

    it("should set timestamp from injected clock", async () => {
      // Arrange
      const messages = [createUserMessage("Hello")];
      const llmService = new FakeLlmService({ responseContent: "Hi there" });
      const fixedTime = "2025-12-25T10:30:00.000Z";
      const clock = new FakeClock(fixedTime);
      const caller = createTestCaller();

      // Act
      const accountService = createMockAccountServiceWithDefaults();
      const result = await execute(
        messages,
        llmService,
        accountService,
        clock,
        caller
      );

      // Assert
      expect(result.timestamp).toBe(fixedTime);
    });

    it("should propagate LLM service errors", async () => {
      // Arrange
      const messages = [createUserMessage("Hello")];
      const llmService = new FakeLlmService({
        shouldThrow: true,
        errorMessage: "LLM service unavailable",
      });
      const clock = new FakeClock();
      const caller = createTestCaller();

      // Act & Assert
      const accountService = createMockAccountServiceWithDefaults();
      await expect(
        execute(messages, llmService, accountService, clock, caller)
      ).rejects.toThrow("LLM service unavailable");
    });
  });
});
