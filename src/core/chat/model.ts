// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@core/chat/model`
 * Purpose: Domain entities and value objects for chat functionality.
 * Scope: Pure domain types with optional timestamps. Does not handle I/O or time operations.
 * Invariants: No Date objects, no I/O dependencies, purely functional types
 * Side-effects: none
 * Notes: Timestamps are optional ISO strings set by feature/route layers
 * Links: Used by ports, features, and adapters
 * @public
 */

/**
 * Tool call embedded in assistant message.
 * Represents a request from the LLM to invoke a tool.
 */
export interface MessageToolCall {
  /** Unique ID for this tool call (model-provided) */
  readonly id: string;
  /** Tool name (snake_case) */
  readonly name: string;
  /** JSON-encoded arguments string */
  readonly arguments: string;
}

export interface Message {
  role: MessageRole;
  content: string;
  /** ISO 8601 string, optional - set by feature layer */
  timestamp?: string;
  /** Tool calls requested by assistant (present when role="assistant" and LLM wants to use tools) */
  toolCalls?: MessageToolCall[];
  /** Tool call ID this message responds to (present when role="tool") */
  toolCallId?: string;
}

export type MessageRole = "user" | "assistant" | "system" | "tool";

export interface Conversation {
  id: string;
  messages: Message[];
}
