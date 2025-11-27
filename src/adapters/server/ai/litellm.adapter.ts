// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/ai/litellm`
 * Purpose: LiteLLM service implementation for AI completion with dynamic cost extraction from response headers.
 * Scope: Implements LlmService port, extracts cost from x-litellm-response-cost header. Does not handle authentication or rate limiting.
 * Invariants: Never sets timestamps; never logs prompts/keys; enforces timeouts; returns message when cost missing; null quarantined
 * Side-effects: IO (HTTP calls to LiteLLM)
 * Notes: Reads cost from HTTP headers (not JSON body), logs structured BILLING_NO_PROVIDER_COST warning when header absent
 * Links: Implements LlmService port, uses serverEnv configuration
 * @internal
 */

import type { LlmService } from "@/ports";
import { serverEnv } from "@/shared/env";

/**
 * Extract provider cost from LiteLLM response headers.
 * Quarantines null at the boundary and returns number | undefined.
 */
function getProviderCostFromHeaders(response: Response): number | undefined {
  const raw = response.headers.get("x-litellm-response-cost");
  if (!raw || raw.trim().length === 0) return undefined;

  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

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

      // Read cost from response headers (LiteLLM returns cost in headers, not body)
      const providerCostFromHeader = getProviderCostFromHeaders(response);

      const data = (await response.json()) as {
        choices: { message: { content: string }; finish_reason?: string }[];
        usage: { prompt_tokens: number; completion_tokens: number };
      };

      if (
        !data.choices ||
        data.choices.length === 0 ||
        !data.choices[0]?.message ||
        typeof data.choices[0].message.content !== "string"
      ) {
        throw new Error("Invalid response from LiteLLM");
      }

      // Build result object conditionally to satisfy exactOptionalPropertyTypes
      const result: Awaited<ReturnType<LlmService["completion"]>> = {
        message: {
          role: "assistant",
          content: data.choices[0].message.content,
        },
        usage: {
          promptTokens: Number(data.usage?.prompt_tokens) || 0,
          completionTokens: Number(data.usage?.completion_tokens) || 0,
          totalTokens:
            Number(data.usage?.prompt_tokens) +
              Number(data.usage?.completion_tokens) || 0,
        },
        providerMeta: data as unknown as Record<string, unknown>,
      };

      console.log(
        JSON.stringify({
          level: "info",
          msg: "[LiteLlmAdapter] used",
          hasResponseCostHeader: !!response.headers.get(
            "x-litellm-response-cost"
          ),
          providerCostUsd: providerCostFromHeader,
          requestId: result.providerMeta?.requestId ?? "unknown",
        })
      );

      // Add optional fields only when present
      if (data.choices[0].finish_reason) {
        result.finishReason = data.choices[0].finish_reason;
      }

      if (typeof providerCostFromHeader === "number") {
        result.providerCostUsd = providerCostFromHeader;
      } else {
        // Log structured warning - service layer will record usage but not debit
        console.warn(
          JSON.stringify({
            code: "BILLING_NO_PROVIDER_COST",
            message:
              "LiteLLM did not return x-litellm-response-cost header - usage recorded but user not charged",
            model,
            totalTokens: result.usage?.totalTokens ?? 0,
          })
        );
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
