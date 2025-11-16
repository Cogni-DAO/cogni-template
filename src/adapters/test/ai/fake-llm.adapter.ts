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
      providerMeta: {
        model: params.model ?? "fake-model",
        provider: "fake",
        requestId: "fake-request-id",
      },
    };
  }
}
