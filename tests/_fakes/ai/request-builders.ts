// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/_fakes/ai/request-builders`
 * Purpose: Builder functions for creating AI request bodies with all required fields.
 * Scope: Request creation utilities for stack/contract tests. Does NOT handle actual API calls.
 * Invariants: All required fields have defaults; includes graphName (required since P0.75).
 * Side-effects: none
 * Notes: Use these builders instead of manual JSON.stringify to avoid missing required fields.
 * Links: ai.completion.v1.contract, ai.chat.v1.contract
 * @public
 */

import type { Message } from "@/core";
import { TEST_MODEL_ID } from "./test-constants";

/**
 * Default graph name for test requests.
 * Per GRAPH_ID_NAMESPACED: format is ${providerId}:${graphName}
 */
export const TEST_GRAPH_NAME = "langgraph:poet";

/**
 * Options for completion request builder.
 */
export interface CompletionRequestOptions {
  /** Messages array (defaults to single user message "Hello") */
  messages?: Array<{ role: string; content: string }>;
  /** Model ID (defaults to TEST_MODEL_ID) */
  model?: string;
  /** Graph name or fully-qualified graphId (defaults to TEST_GRAPH_NAME) */
  graphName?: string;
}

/**
 * Options for chat request builder.
 */
export interface ChatRequestOptions {
  /** Messages array in assistant-ui format (defaults to single user text message) */
  messages?: Array<{
    role: string;
    content: string | Array<{ type: string; text?: string }>;
  }>;
  /** Model ID (defaults to TEST_MODEL_ID) */
  model?: string;
  /** Graph name or fully-qualified graphId (defaults to TEST_GRAPH_NAME) */
  graphName?: string;
  /** Optional state key for multi-turn conversations */
  stateKey?: string;
  /** Optional system prompt */
  system?: string;
}

/**
 * Create a completion request body for v1/ai/completion endpoint.
 *
 * Per ai.completion.v1.contract: requires messages, model, graphName.
 *
 * @example
 * ```ts
 * const body = createCompletionRequest({
 *   messages: [{ role: "user", content: "Hello" }],
 * });
 * const req = new NextRequest("http://localhost/api/v1/ai/completion", {
 *   method: "POST",
 *   body: JSON.stringify(body),
 * });
 * ```
 */
export function createCompletionRequest(
  options: CompletionRequestOptions = {}
): {
  messages: Array<{ role: string; content: string }>;
  model: string;
  graphName: string;
} {
  return {
    messages: options.messages ?? [{ role: "user", content: "Hello" }],
    model: options.model ?? TEST_MODEL_ID,
    graphName: options.graphName ?? TEST_GRAPH_NAME,
  };
}

/**
 * Create a chat request body for v1/ai/chat endpoint.
 *
 * Per ai.chat.v1.contract: requires messages, model, graphName.
 * Supports optional stateKey, system prompt.
 *
 * @example
 * ```ts
 * const body = createChatRequest({
 *   messages: [{ role: "user", content: "Hello" }],
 *   stateKey: "conv-123",
 * });
 * const req = new NextRequest("http://localhost/api/v1/ai/chat", {
 *   method: "POST",
 *   body: JSON.stringify(body),
 * });
 * ```
 */
export function createChatRequest(options: ChatRequestOptions = {}): {
  messages: Array<{
    role: string;
    content: string | Array<{ type: string; text?: string }>;
  }>;
  model: string;
  graphName: string;
  stateKey?: string;
  system?: string;
} {
  const base = {
    messages: options.messages ?? [{ role: "user", content: "Hello" }],
    model: options.model ?? TEST_MODEL_ID,
    graphName: options.graphName ?? TEST_GRAPH_NAME,
  };

  // Add optional fields if provided
  return {
    ...base,
    ...(options.stateKey && { stateKey: options.stateKey }),
    ...(options.system && { system: options.system }),
  };
}

/**
 * Create a completion request body from Message[] (internal format).
 * Converts from Message[] to completion contract DTO format.
 *
 * @example
 * ```ts
 * const messages = [createUserMessage("Hello"), createAssistantMessage("Hi")];
 * const body = createCompletionRequestFromMessages(messages);
 * ```
 */
export function createCompletionRequestFromMessages(
  messages: Message[],
  options?: Omit<CompletionRequestOptions, "messages">
): ReturnType<typeof createCompletionRequest> {
  return createCompletionRequest({
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    ...options,
  });
}

/**
 * Create a chat request body from Message[] (internal format).
 * Converts from Message[] to chat contract DTO format (assistant-ui).
 *
 * @example
 * ```ts
 * const messages = [createUserMessage("Hello")];
 * const body = createChatRequestFromMessages(messages, { stateKey: "conv-1" });
 * ```
 */
export function createChatRequestFromMessages(
  messages: Message[],
  options?: Omit<ChatRequestOptions, "messages">
): ReturnType<typeof createChatRequest> {
  return createChatRequest({
    // Chat uses assistant-ui format (can be string or content parts array)
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    ...options,
  });
}
