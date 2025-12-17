// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@ports/llm.port`
 * Purpose: LLM service abstraction for hexagonal architecture.
 * Scope: Future-ready interface that won't require refactoring when adding streaming/metadata. Does not handle authentication or rate limiting.
 * Invariants: Only depends on core domain types, no infrastructure concerns
 * Side-effects: none (interface only)
 * Notes: Supports optional parameters, returns structured response with metadata
 * Links: Implemented by adapters, used by features
 * @public
 */

import type { Message } from "@/core";

// Re-export Message for adapters
export type { Message } from "@/core";

export interface LlmCaller {
  billingAccountId: string;
  virtualKeyId: string;
  /** Request correlation ID - for LiteLLM metadata propagation */
  requestId: string;
  /** OTel trace ID - for LiteLLM metadata propagation */
  traceId: string;
}

export interface CompletionStreamParams {
  messages: Message[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  caller: LlmCaller;
  abortSignal?: AbortSignal;
}

export type ChatDeltaEvent =
  | { type: "text_delta"; delta: string }
  | { type: "error"; error: string }
  | { type: "done" };

/**
 * Result type for LLM completion operations.
 * Extended with reproducibility keys per AI_SETUP_SPEC.md.
 */
export interface LlmCompletionResult {
  message: Message;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: "stop" | "length" | "tool_calls" | "content_filter" | string;
  providerMeta?: Record<string, unknown>;
  providerCostUsd?: number;
  /** LiteLLM call ID for forensic correlation (x-litellm-call-id header or response id) */
  litellmCallId?: string;
  /** SHA-256 hash of canonical outbound payload (model/messages/temperature/tools) for reproducibility */
  promptHash?: string;
  /** Resolved provider name (e.g., "openai", "anthropic") from LiteLLM response */
  resolvedProvider?: string;
  /** Resolved model ID (e.g., "gpt-4o-2024-11-20") from LiteLLM response */
  resolvedModel?: string;
}

export interface LlmService {
  completion(params: {
    messages: Message[];
    model?: string;
    temperature?: number;
    maxTokens?: number;
    caller: LlmCaller;
  }): Promise<LlmCompletionResult>;

  completionStream(params: CompletionStreamParams): Promise<{
    stream: AsyncIterable<ChatDeltaEvent>;
    final: Promise<LlmCompletionResult>;
  }>;
}
