// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/ai/litellm`
 * Purpose: LiteLLM service implementation for AI completion.
 * Scope: Implement LlmService port, return content only (no timestamps). Does not handle authentication or rate limiting.
 * Invariants: Never sets timestamps, never logs prompts/keys, enforces timeouts
 * Side-effects: IO (HTTP calls to LiteLLM)
 * Notes: Provides defaults from serverEnv, handles provider-specific formatting
 * Links: Implements LlmService port, uses serverEnv configuration
 * @internal
 */

import type { LlmService } from "@/ports";
import { serverEnv } from "@/shared/env";

export class LiteLlmAdapter implements LlmService {
  async completion(
    params: Parameters<LlmService["completion"]>[0]
  ): ReturnType<LlmService["completion"]> {
    // Adapter provides defaults from serverEnv
    const model = params.model ?? serverEnv().DEFAULT_MODEL;
    const temperature = params.temperature ?? 0.7;
    const maxTokens = params.maxTokens ?? 2048;

    // Extract caller data - caller required by route enforcement
    const { billingAccountId: user, litellmVirtualKey } = params.caller;

    // Convert core Messages to LiteLLM format
    const liteLlmMessages = params.messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    const requestBody = {
      model,
      messages: liteLlmMessages,
      temperature,
      max_tokens: maxTokens,
      user,
    };

    try {
      // HTTP call to LiteLLM with timeout enforcement
      const response = await fetch(
        `${serverEnv().LITELLM_BASE_URL}/v1/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${litellmVirtualKey}`,
          },
          body: JSON.stringify(requestBody),
          /** 30 second timeout */
          signal: AbortSignal.timeout(30000),
        }
      );

      if (!response.ok) {
        throw new Error(
          `LiteLLM API error: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();

      // Extract response - never log full prompts or keys
      const choice = data.choices?.[0];
      if (!choice?.message?.content) {
        throw new Error("Invalid response from LiteLLM: missing content");
      }

      // Build response object with proper optional property handling
      const result: Awaited<ReturnType<LlmService["completion"]>> = {
        message: {
          role: "assistant",
          content: choice.message.content,
        },
        finishReason: choice.finish_reason,
        providerMeta: {
          model,
          provider: "litellm",
          requestId: data.id,
        },
      };

      // Only add usage if present
      if (data.usage) {
        result.usage = {
          promptTokens: Number(data.usage.prompt_tokens) || 0,
          completionTokens: Number(data.usage.completion_tokens) || 0,
          totalTokens: Number(data.usage.total_tokens) || 0,
        };
      }

      return result;
    } catch (error) {
      // Map provider errors to typed errors (no stack leaks)
      if (error instanceof Error) {
        throw new Error(`LiteLLM completion failed: ${error.message}`);
      }
      throw new Error("LiteLLM completion failed: Unknown error");
    }
  }
}
