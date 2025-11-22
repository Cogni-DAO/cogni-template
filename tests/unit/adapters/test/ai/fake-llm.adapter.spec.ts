// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/test/ai/fake-llm.adapter`
 * Purpose: Unit tests for deterministic fake LLM adapter behavior in CI environments.
 * Scope: Tests fixed responses, parameter handling, consistency. Does NOT test external integrations.
 * Invariants: Always returns identical responses; no side effects; implements LlmService contract.
 * Side-effects: none
 * Notes: Validates CI determinism and interface compliance; tests cover all adapter methods.
 * Links: src/adapters/test/ai/fake-llm.adapter.ts, LlmService port
 * @public
 */

import { beforeEach, describe, expect, it } from "vitest";

import { FakeLlmAdapter } from "@/adapters/test/ai/fake-llm.adapter";
import type { LlmCaller, LlmService } from "@/ports";

describe("FakeLlmAdapter deterministic behavior", () => {
  let adapter: LlmService;

  // Helper to create test caller
  const createTestCaller = (): LlmCaller => ({
    billingAccountId: "test-user",
    virtualKeyId: "virtual-key-1",
    litellmVirtualKey: "test-key-12345678",
  });

  beforeEach(() => {
    adapter = new FakeLlmAdapter();
  });

  describe("completion method", () => {
    it("returns fixed FAKE_COMPLETION content", async () => {
      const params = {
        model: "test-model",
        messages: [{ role: "user" as const, content: "Test prompt" }],
        caller: createTestCaller(),
      };

      const result = await adapter.completion(params);

      expect(result.message.role).toBe("assistant");
      expect(result.message.content).toBe("[FAKE_COMPLETION]");
    });

    it("returns deterministic usage statistics", async () => {
      const params = {
        model: "any-model",
        messages: [{ role: "user" as const, content: "Any prompt" }],
        caller: createTestCaller(),
      };

      const result = await adapter.completion(params);

      expect(result.usage).toEqual({
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      });
    });

    it("respects model parameter in providerMeta", async () => {
      const customModel = "custom-test-model";
      const params = {
        model: customModel,
        messages: [{ role: "user" as const, content: "Test" }],
        caller: createTestCaller(),
      };

      const result = await adapter.completion(params);

      expect(result.providerMeta?.model).toBe(customModel);
      expect(result.providerMeta?.provider).toBe("fake");
      expect(result.providerMeta?.requestId).toBe("fake-request-id");
    });

    it("uses default model when none provided", async () => {
      const params = {
        messages: [{ role: "user" as const, content: "Test" }],
        caller: createTestCaller(),
      };

      const result = await adapter.completion(params);

      expect(result.providerMeta?.model).toBe("fake-model");
    });

    it("always returns stop finish reason", async () => {
      const params = {
        model: "test",
        messages: [{ role: "user" as const, content: "Test" }],
        caller: createTestCaller(),
      };

      const result = await adapter.completion(params);

      expect(result.finishReason).toBe("stop");
    });

    it("returns identical responses for identical calls", async () => {
      const params = {
        model: "consistent-model",
        messages: [{ role: "user" as const, content: "Consistent prompt" }],
        caller: createTestCaller(),
      };

      const result1 = await adapter.completion(params);
      const result2 = await adapter.completion(params);

      expect(result1).toEqual(result2);
    });

    it("returns identical responses regardless of input variation", async () => {
      const params1 = {
        model: "model-1",
        messages: [
          { role: "system" as const, content: "You are helpful" },
          { role: "user" as const, content: "Question 1" },
        ],
        caller: createTestCaller(),
      };

      const params2 = {
        model: "model-2",
        messages: [{ role: "user" as const, content: "Completely different" }],
        caller: createTestCaller(),
      };

      const result1 = await adapter.completion(params1);
      const result2 = await adapter.completion(params2);

      // Content should be identical despite different inputs
      expect(result1.message.content).toBe(result2.message.content);
      expect(result1.usage).toEqual(result2.usage);
      expect(result1.finishReason).toBe(result2.finishReason);

      // Only model should differ
      expect(result1.providerMeta?.model).toBe("model-1");
      expect(result2.providerMeta?.model).toBe("model-2");
    });
  });

  describe("LlmService interface compliance", () => {
    it("implements LlmService interface correctly", () => {
      // Type assertion ensures interface compliance at compile time
      const service: LlmService = adapter;
      expect(service.completion).toBeTypeOf("function");
    });

    it("completion method has correct async signature", () => {
      const params = {
        messages: [{ role: "user" as const, content: "Test" }],
        caller: createTestCaller(),
      };

      const result = adapter.completion(params);
      expect(result).toBeInstanceOf(Promise);
    });
  });
});
