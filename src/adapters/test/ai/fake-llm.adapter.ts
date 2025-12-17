// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/test/ai/fake-llm.adapter`
 * Purpose: Deterministic fake LLM adapter for CI and test environments.
 * Scope: Implements LlmService port with predictable responses. Does not make external calls.
 * Invariants: Always returns fixed content; never varies behavior; no side effects.
 * Side-effects: none
 * Notes: Used when APP_ENV=test; keeps responses deterministic for CI.
 * Links: Implements LlmService port
 * @internal
 */

import type { LlmService } from "@/ports";

export class FakeLlmAdapter implements LlmService {
  async completion(
    params: Parameters<LlmService["completion"]>[0]
  ): ReturnType<LlmService["completion"]> {
    // Fixed deterministic response for CI/test environments
    return {
      message: {
        role: "assistant",
        content: "[FAKE_COMPLETION]",
      },
      usage: {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      },
      finishReason: "stop",
      providerCostUsd: 0.0001, // Small fixed cost for billing tests ($0.0001 = 0.1 credits @ 1000 credits/USD)
      providerMeta: {
        model: params.model ?? "fake-model",
        provider: "fake",
        requestId: "fake-request-id",
      },
      // AI_SETUP_SPEC.md fields for telemetry
      litellmCallId: "fake-litellm-call-id",
      resolvedProvider: "fake",
      resolvedModel: params.model ?? "fake-model",
    };
  }

  async completionStream(
    params: Parameters<LlmService["completionStream"]>[0]
  ): ReturnType<LlmService["completionStream"]> {
    const content = "[FAKE_STREAM_COMPLETION]";

    // Split content into ~10 chunks for realistic streaming simulation
    const words = content.split(" ");
    const chunks: string[] = [];
    if (words.length <= 1) {
      // If content has no spaces, split by characters (every 2-3 chars)
      for (let i = 0; i < content.length; i += 2) {
        chunks.push(content.slice(i, i + 2));
      }
    } else {
      // Split by words
      for (const word of words) {
        chunks.push(`${word} `);
      }
    }

    const usage = {
      promptTokens: 10,
      completionTokens: chunks.length,
      totalTokens: 10 + chunks.length,
    };
    const providerCostUsd = 0.0001;

    const stream = (async function* () {
      for (const chunk of chunks) {
        yield { type: "text_delta", delta: chunk } as const;
        // Small delay to simulate network latency (1-5ms)
        await new Promise((resolve) =>
          setTimeout(resolve, 1 + Math.random() * 4)
        );
      }
      yield { type: "done" } as const;
    })();

    return {
      stream: stream as AsyncIterable<import("@/ports").ChatDeltaEvent>,
      final: Promise.resolve({
        message: {
          role: "assistant",
          content,
        },
        usage,
        finishReason: "stop",
        providerCostUsd,
        providerMeta: {
          model: params.model ?? "fake-model",
          provider: "fake",
          requestId: "fake-request-id",
        },
        // AI_SETUP_SPEC.md fields for telemetry
        litellmCallId: "fake-litellm-call-id",
        resolvedProvider: "fake",
        resolvedModel: params.model ?? "fake-model",
      }),
    };
  }
}
