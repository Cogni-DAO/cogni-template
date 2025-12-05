// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/ai/litellm`
 * Purpose: LiteLLM service implementation for AI completion and streaming with dynamic cost extraction from response headers.
 * Scope: Implements LlmService port (completion + completionStream), extracts cost from x-litellm-response-cost header. Does not handle authentication or rate limiting.
 * Invariants: Never sets timestamps; never logs prompts/keys; 15s connect timeout (TTFB only); stream settles exactly once; null quarantined
 * Side-effects: IO (HTTP calls to LiteLLM)
 * Notes: Uses eventsource-parser for SSE; logs malformed chunks as warnings; yields error events on provider errors
 * Links: Implements LlmService port, uses serverEnv configuration, defer<T>() helper ensures promise settlement safety
 * @internal
 */

import {
  createParser,
  type EventSourceMessage,
  type EventSourceParser,
} from "eventsource-parser";
import type { ChatDeltaEvent, LlmService } from "@/ports";
import { serverEnv } from "@/shared/env";
import { makeLogger } from "@/shared/observability";

const logger = makeLogger({ component: "LiteLlmAdapter" });

/**
 * Create a deferred promise with resolve/reject callbacks.
 * Ensures promise settles exactly once.
 */
function defer<T>() {
  let settled = false;
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = (value) => {
      if (!settled) {
        settled = true;
        res(value);
      }
    };
    reject = (reason) => {
      if (!settled) {
        settled = true;
        rej(reason);
      }
    };
  });
  return { promise, resolve, reject };
}

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
        usage: {
          prompt_tokens: number;
          completion_tokens: number;
          total_tokens?: number;
        };
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
      const promptTokens = Number(data.usage?.prompt_tokens) || 0;
      const completionTokens = Number(data.usage?.completion_tokens) || 0;
      const totalTokens = data.usage?.total_tokens
        ? Number(data.usage.total_tokens)
        : promptTokens + completionTokens;

      const result: Awaited<ReturnType<LlmService["completion"]>> = {
        message: {
          role: "assistant",
          content: data.choices[0].message.content,
        },
        usage: {
          promptTokens,
          completionTokens,
          totalTokens,
        },
        providerMeta: data as unknown as Record<string, unknown>,
      };

      // Add optional fields only when present
      if (data.choices[0].finish_reason) {
        result.finishReason = data.choices[0].finish_reason;
      }

      if (typeof providerCostFromHeader === "number") {
        result.providerCostUsd = providerCostFromHeader;
      }

      // Sanitized adapter log (no content, bounded fields only)
      logger.info(
        {
          model,
          tokensUsed: totalTokens,
          finishReason: result.finishReason,
          hasCost: typeof providerCostFromHeader === "number",
          contentLength: data.choices[0].message.content.length,
        },
        "adapter.litellm.completion_result"
      );

      return result;
    } catch (error) {
      // Map provider errors to typed errors (no stack leaks)
      if (error instanceof Error) {
        throw new Error(`LiteLLM completion failed: ${error.message}`);
      }
      throw new Error("LiteLLM completion failed: Unknown error");
    }
  }

  async completionStream(
    params: Parameters<LlmService["completionStream"]>[0]
  ): ReturnType<LlmService["completionStream"]> {
    const model = params.model ?? serverEnv().DEFAULT_MODEL;
    const temperature = params.temperature ?? 0.7;
    const maxTokens = params.maxTokens ?? 2048;
    const { billingAccountId: user, litellmVirtualKey } = params.caller;

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
      stream: true,
      stream_options: { include_usage: true }, // Request usage in stream if supported
    };

    let response: Response;
    // Use short timeout for connection/TTFB only (not entire stream duration)
    const connectCtl = new AbortController();
    const connectTimer = setTimeout(() => connectCtl.abort(), 15000);
    try {
      const signal = params.abortSignal
        ? AbortSignal.any([connectCtl.signal, params.abortSignal])
        : connectCtl.signal;

      response = await fetch(
        `${serverEnv().LITELLM_BASE_URL}/v1/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${litellmVirtualKey}`,
          },
          body: JSON.stringify(requestBody),
          signal,
        }
      );
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw error; // Propagate abort immediately
      }
      throw new Error(
        `LiteLLM stream init failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      clearTimeout(connectTimer);
    }

    if (!response.ok) {
      throw new Error(
        `LiteLLM API error: ${response.status} ${response.statusText}`
      );
    }

    // Capture response.body to prove non-null to TypeScript
    const body = response.body;
    if (!body) {
      throw new Error("LiteLLM response body is empty");
    }

    // Capture cost from headers if available immediately (unlikely for stream)
    const providerCostUsd = getProviderCostFromHeaders(response);

    // Create a deferred promise for the final result (matches completion() return type)
    type CompletionResult = Awaited<ReturnType<LlmService["completion"]>>;
    const deferred = defer<CompletionResult>();

    const stream: AsyncIterable<ChatDeltaEvent> =
      (async function* (): AsyncGenerator<ChatDeltaEvent> {
        const reader = body.getReader();
        const decoder = new TextDecoder();
        let fullContent = "";
        let finalUsage:
          | {
              promptTokens: number;
              completionTokens: number;
              totalTokens: number;
            }
          | undefined;
        let finishReason: string | undefined;

        // Queue for parsed events from eventsource-parser
        const eventQueue: EventSourceMessage[] = [];

        const parser: EventSourceParser = createParser({
          onEvent(event: EventSourceMessage) {
            eventQueue.push(event);
          },
        });

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // Feed decoded chunk to eventsource-parser
            const chunk = decoder.decode(value, { stream: true });
            parser.feed(chunk);

            // Process all queued events
            while (eventQueue.length > 0) {
              const event = eventQueue.shift();
              if (!event) break;
              const data = event.data;

              if (data === "[DONE]") {
                yield { type: "done" } as const;
                continue;
              }

              try {
                const json = JSON.parse(data);

                // Check for provider error in response
                if (json.error) {
                  const errorMsg =
                    typeof json.error === "string"
                      ? json.error
                      : json.error.message || "Provider error";
                  const errorText = `LiteLLM stream error: ${errorMsg}`;
                  yield { type: "error", error: errorText } as const;
                  deferred.reject(new Error(errorText));
                  return;
                }

                if (json.usage) {
                  finalUsage = {
                    promptTokens: json.usage.prompt_tokens,
                    completionTokens: json.usage.completion_tokens,
                    totalTokens: json.usage.total_tokens,
                  };
                }

                const choice = json.choices?.[0];
                if (choice) {
                  if (choice.finish_reason) {
                    finishReason = choice.finish_reason;
                  }

                  const content = choice.delta?.content;
                  if (content) {
                    fullContent += content;
                    yield { type: "text_delta", delta: content } as const;
                  }
                }
              } catch (parseError) {
                // Log malformed JSON but continue streaming (transient SSE noise)
                const errorMessage =
                  parseError instanceof Error
                    ? parseError.message
                    : "JSON parse error";
                logger.warn(
                  { data: data.slice(0, 100) },
                  `Malformed SSE data: ${errorMessage}`
                );
                // Do not yield error - continue processing remaining events
              }
            }
          }
        } catch (error: unknown) {
          if (error instanceof Error && error.name === "AbortError") {
            // Stream aborted - resolve final with partial content, no error yield
          } else {
            // Real stream failure
            deferred.reject(error);
            return;
          }
        } finally {
          reader.releaseLock();
          // Build result object conditionally to satisfy exactOptionalPropertyTypes
          const result: CompletionResult = {
            message: { role: "assistant", content: fullContent },
          };
          if (finalUsage) {
            result.usage = finalUsage;
          }
          if (finishReason) {
            result.finishReason = finishReason;
          }
          if (typeof providerCostUsd === "number") {
            result.providerCostUsd = providerCostUsd;
          }

          // ALWAYS include providerMeta with model (SSE doesn't return this, use request param)
          result.providerMeta = {
            model,
            provider: "litellm",
          };

          // Invariant enforcement: model must be set
          if (!result.providerMeta.model) {
            logger.warn(
              { model, hasUsage: !!finalUsage },
              "inv_stream_missing_provider_meta: Stream result missing providerMeta.model"
            );
          }

          // Sanitized adapter log (no content, bounded fields only)
          logger.info(
            {
              model: result.providerMeta.model,
              provider: result.providerMeta.provider,
              tokensUsed: finalUsage?.totalTokens,
              finishReason,
              hasCost: typeof providerCostUsd === "number",
              contentLength: fullContent.length,
            },
            "adapter.litellm.stream_result"
          );
          deferred.resolve(result);
        }
      })();

    return {
      stream,
      final: deferred.promise,
    };
  }
}
