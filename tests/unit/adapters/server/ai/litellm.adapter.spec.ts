// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/ai/litellm`
 * Purpose: Unit tests for LiteLLM adapter with mocked HTTP calls and error handling.
 * Scope: Tests adapter logic, parameter handling, response parsing, missing cost handling. Does NOT test real LiteLLM service.
 * Invariants: No real HTTP calls; deterministic responses; validates LlmService contract compliance; warns on missing cost
 * Side-effects: none (mocked fetch)
 * Notes: Tests defaults, error handling, timeout enforcement, response mapping, console.warn spy for cost warnings
 * Links: src/adapters/server/ai/litellm.adapter.ts, LlmService port
 * @public
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { LiteLlmAdapter } from "@/adapters/server/ai/litellm.adapter";
import type { LlmCaller, LlmService } from "@/ports";

// Mock the serverEnv module
vi.mock("@/shared/env", () => ({
  serverEnv: () => ({
    DEFAULT_MODEL: "gpt-3.5-turbo",
    LITELLM_BASE_URL: "https://api.test-litellm.com",
  }),
}));

describe("LiteLlmAdapter", () => {
  let adapter: LlmService;
  const testCaller: LlmCaller = {
    billingAccountId: "test-user-123",
    virtualKeyId: "vk-test-1",
    litellmVirtualKey: "test-api-key-456",
  };

  // Mock fetch globally
  const mockFetch = vi.fn();

  beforeEach(() => {
    adapter = new LiteLlmAdapter();
    vi.clearAllMocks();
    global.fetch = mockFetch;
  });

  describe("completion method", () => {
    const basicParams = {
      messages: [{ role: "user" as const, content: "Hello world" }],
      caller: testCaller,
    };

    const mockSuccessResponse = {
      id: "chatcmpl-test-123",
      choices: [
        {
          message: {
            role: "assistant",
            content: "Hello! How can I help you today?",
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 8,
        total_tokens: 18,
      },
      response_cost: 0.0002,
    };

    it("sends correct request to LiteLLM API", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => mockSuccessResponse,
      });

      await adapter.completion(basicParams);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test-litellm.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer test-api-key-456",
          },
          body: JSON.stringify({
            model: "gpt-3.5-turbo", // default from env
            messages: [{ role: "user", content: "Hello world" }],
            temperature: 0.7, // default
            max_tokens: 2048, // default
            user: "test-user-123",
          }),
          signal: expect.any(AbortSignal),
        }
      );
    });

    it("uses provided parameters over defaults", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => mockSuccessResponse,
      });

      await adapter.completion({
        ...basicParams,
        model: "custom-model",
        temperature: 0.2,
        maxTokens: 1024,
      });

      const firstCall = mockFetch.mock.calls[0];
      expect(firstCall).toBeDefined();
      const requestOptions = firstCall?.[1];
      expect(requestOptions).toBeDefined();
      const requestBody = JSON.parse(requestOptions?.body as string);
      expect(requestBody).toEqual({
        model: "custom-model",
        messages: [{ role: "user", content: "Hello world" }],
        temperature: 0.2,
        max_tokens: 1024,
        user: "test-user-123",
      });
    });

    it("returns properly formatted response with usage and cost from header", async () => {
      const mockHeaders = new Headers();
      mockHeaders.set("x-litellm-response-cost", "0.0002");

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: mockHeaders,
        json: async () => mockSuccessResponse,
      });

      const result = await adapter.completion(basicParams);

      expect(result).toEqual({
        message: {
          role: "assistant",
          content: "Hello! How can I help you today?",
        },
        finishReason: "stop",
        providerMeta: mockSuccessResponse,
        usage: {
          promptTokens: 10,
          completionTokens: 8,
          totalTokens: 18,
        },
        providerCostUsd: 0.0002,
      });
    });

    it("returns message without providerCostUsd when x-litellm-response-cost header is missing", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // Mock response without cost header
      const mockHeaders = new Headers();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: mockHeaders,
        json: async () => mockSuccessResponse,
      });

      const result = await adapter.completion(basicParams);

      // Message should still be returned
      expect(result.message.content).toBe("Hello! How can I help you today?");
      expect(result.message.role).toBe("assistant");

      // providerCostUsd should be absent (not undefined)
      expect(result).not.toHaveProperty("providerCostUsd");

      // Other fields should still be present
      expect(result.usage).toEqual({
        promptTokens: 10,
        completionTokens: 8,
        totalTokens: 18,
      });

      // Structured warning with BILLING_NO_PROVIDER_COST code should be logged
      expect(warnSpy).toHaveBeenCalledOnce();
      const loggedArg = warnSpy.mock.calls[0]?.[0];
      expect(loggedArg).toBeDefined();
      const loggedData = JSON.parse(loggedArg as string);
      expect(loggedData.code).toBe("BILLING_NO_PROVIDER_COST");
      expect(loggedData.model).toBe("gpt-3.5-turbo");
      expect(loggedData.totalTokens).toBe(18);

      warnSpy.mockRestore();
    });

    it("handles multiple messages correctly", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => mockSuccessResponse,
      });

      await adapter.completion({
        ...basicParams,
        messages: [
          { role: "system", content: "You are helpful" },
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi there!" },
          { role: "user", content: "How are you?" },
        ],
      });

      const firstCall = mockFetch.mock.calls[0];
      expect(firstCall).toBeDefined();
      const requestOptions = firstCall?.[1];
      expect(requestOptions).toBeDefined();
      const requestBody = JSON.parse(requestOptions?.body as string);
      expect(requestBody.messages).toEqual([
        { role: "system", content: "You are helpful" },
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
        { role: "user", content: "How are you?" },
      ]);
    });

    it("throws error when API returns non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      });

      await expect(adapter.completion(basicParams)).rejects.toThrow(
        "LiteLLM completion failed: LiteLLM API error: 401 Unauthorized"
      );
    });

    it("throws error when response has no content", async () => {
      const invalidResponse = {
        id: "test-id",
        choices: [
          {
            message: {}, // no content
            finish_reason: "stop",
          },
        ],
        response_cost: 0.0002,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => invalidResponse,
      });

      await expect(adapter.completion(basicParams)).rejects.toThrow(
        "LiteLLM completion failed: Invalid response from LiteLLM"
      );
    });

    it("throws error when response has no choices", async () => {
      const invalidResponse = {
        id: "test-id",
        choices: null,
        response_cost: 0.0002,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => invalidResponse,
      });

      await expect(adapter.completion(basicParams)).rejects.toThrow(
        "LiteLLM completion failed: Invalid response from LiteLLM"
      );
    });

    it("handles fetch network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      await expect(adapter.completion(basicParams)).rejects.toThrow(
        "LiteLLM completion failed: Network error"
      );
    });

    it("handles unknown error", async () => {
      mockFetch.mockRejectedValueOnce("Unknown error string");

      await expect(adapter.completion(basicParams)).rejects.toThrow(
        "LiteLLM completion failed: Unknown error"
      );
    });

    it("handles different finish reasons", async () => {
      const responseWithFinishReason = {
        ...mockSuccessResponse,
        choices: [
          {
            message: { content: "Response" },
            finish_reason: "length",
          },
        ],
        response_cost: 0.0002,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => responseWithFinishReason,
      });

      const result = await adapter.completion(basicParams);
      expect(result.finishReason).toBe("length");
    });

    it("handles usage with string numbers", async () => {
      const responseWithStringUsage = {
        ...mockSuccessResponse,
        usage: {
          prompt_tokens: "15",
          completion_tokens: "12",
          total_tokens: "27",
        },
        response_cost: 0.0002,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => responseWithStringUsage,
      });

      const result = await adapter.completion(basicParams);
      expect(result.usage).toEqual({
        promptTokens: 15,
        completionTokens: 12,
        totalTokens: 27,
      });
    });

    it("handles invalid usage numbers by defaulting to 0", async () => {
      const responseWithInvalidUsage = {
        ...mockSuccessResponse,
        usage: {
          prompt_tokens: "invalid",
          completion_tokens: null,
          total_tokens: undefined,
        },
        response_cost: 0.0002,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => responseWithInvalidUsage,
      });

      const result = await adapter.completion(basicParams);
      expect(result.usage).toEqual({
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      });
    });
  });

  describe("LlmService interface compliance", () => {
    it("implements LlmService interface correctly", () => {
      const service: LlmService = adapter;
      expect(service.completion).toBeTypeOf("function");
    });

    it("completion method returns a promise", () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          id: "test",
          choices: [{ message: { content: "test" }, finish_reason: "stop" }],
          response_cost: 0.0002,
        }),
      });

      const result = adapter.completion({
        messages: [{ role: "user", content: "test" }],
        caller: testCaller,
      });

      expect(result).toBeInstanceOf(Promise);
    });
  });
});
