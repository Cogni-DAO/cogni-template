// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/ai/litellm`
 * Purpose: Unit tests for LiteLLM adapter with mocked HTTP calls and error handling.
 * Scope: Tests adapter logic, parameter handling, response parsing, missing cost handling. Does NOT test real LiteLLM service.
 * Invariants: No real HTTP calls; deterministic responses; validates LlmService contract compliance; model param required (no env fallback)
 * Side-effects: none (mocked fetch)
 * Notes: Tests error handling, timeout enforcement, response mapping, missing model validation. No DEFAULT_MODEL - model must be explicitly provided.
 * Links: src/adapters/server/ai/litellm.adapter.ts, LlmService port
 * @public
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { LiteLlmAdapter } from "@/adapters/server/ai/litellm.adapter";
import type { LlmCaller, LlmService } from "@/ports";

// Mock the serverEnv module - LITELLM_BASE_URL and LITELLM_MASTER_KEY needed
vi.mock("@/shared/env", () => ({
  serverEnv: () => ({
    LITELLM_BASE_URL: "https://api.test-litellm.com",
    LITELLM_MASTER_KEY: "test-master-key-secret",
  }),
}));

describe("LiteLlmAdapter", () => {
  let adapter: LlmService;
  const testCaller: LlmCaller = {
    billingAccountId: "test-user-123",
    virtualKeyId: "vk-test-1",
    requestId: "req-test-abc",
    traceId: "trace-test-xyz",
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
      model: "gpt-3.5-turbo", // model is required (no env fallback)
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

    it("sends correct request to LiteLLM API with master key auth", async () => {
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
            Authorization: "Bearer test-master-key-secret", // Uses master key, not per-user virtual key
          },
          body: JSON.stringify({
            model: "gpt-3.5-turbo", // explicitly provided (required)
            messages: [{ role: "user", content: "Hello world" }],
            temperature: 0.7, // default
            max_tokens: 2048, // default
            user: "test-user-123", // billingAccountId for cost attribution
            metadata: {
              cogni_billing_account_id: "test-user-123",
              request_id: "req-test-abc",
              existing_trace_id: "trace-test-xyz",
            },
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
        metadata: {
          cogni_billing_account_id: "test-user-123",
          request_id: "req-test-abc",
          existing_trace_id: "trace-test-xyz",
        },
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
        litellmCallId: "chatcmpl-test-123", // From response.id, used for joining with /spend/logs
        // New fields per AI_SETUP_SPEC.md
        promptHash: expect.any(String), // SHA-256 hash of canonical payload
        resolvedProvider: "openai", // Inferred from "gpt-" prefix in model name
        resolvedModel: "gpt-3.5-turbo", // From response (defaults to request model)
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

      // Note: Missing cost header logging removed from adapter
      // Feature layer handles this via completion.ts logging
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
        "LiteLLM API error: 401 Unauthorized"
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
        "Invalid response from LiteLLM"
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
        "Invalid response from LiteLLM"
      );
    });

    it("handles fetch network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      await expect(adapter.completion(basicParams)).rejects.toThrow(
        "LiteLLM network error: Network error"
      );
    });

    it("handles unknown error", async () => {
      mockFetch.mockRejectedValueOnce("Unknown error string");

      await expect(adapter.completion(basicParams)).rejects.toThrow(
        "LiteLLM completion failed: Unknown error"
      );
    });

    it("throws error when model parameter is missing", async () => {
      const paramsWithoutModel = {
        messages: [{ role: "user" as const, content: "Hello" }],
        caller: testCaller,
      };

      await expect(adapter.completion(paramsWithoutModel)).rejects.toThrow(
        "LiteLLM completion requires model parameter"
      );

      // Verify fetch was never called
      expect(mockFetch).not.toHaveBeenCalled();
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

  describe("AI_SETUP_SPEC.md: Correlation ID propagation", () => {
    it("includes request_id and trace_id in LiteLLM metadata", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          id: "test",
          choices: [{ message: { content: "test" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      });

      await adapter.completion({
        model: "test-model",
        messages: [{ role: "user", content: "test" }],
        caller: {
          billingAccountId: "acc-123",
          virtualKeyId: "vk-456",
          requestId: "req-correlation-test",
          traceId: "trace-correlation-test",
        },
      });

      const requestBody = JSON.parse(
        mockFetch.mock.calls[0]?.[1]?.body as string
      );
      expect(requestBody.metadata).toEqual({
        cogni_billing_account_id: "acc-123",
        request_id: "req-correlation-test",
        existing_trace_id: "trace-correlation-test",
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
        model: "test-model", // model is required
        messages: [{ role: "user", content: "test" }],
        caller: testCaller,
      });

      expect(result).toBeInstanceOf(Promise);
    });
  });
});
