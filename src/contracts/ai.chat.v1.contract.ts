// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@contracts/ai.chat.v1.contract`
 * Purpose: Chat API contract for assistant-ui integration with streaming-ready structure.
 * Scope: Wire format definition (assistant-ui ThreadMessageLike shape). Does not contain business logic or transformations.
 * Invariants: Contract remains stable; breaking changes require new version. All consumers use z.infer types.
 * Side-effects: none
 * Notes: requestId optional on input (user messages), required on output (assistant messages)
 * Links: Used by /api/v1/ai/chat route and chat runtime provider
 * @internal
 */

import { z } from "zod";

/** Message length limit - matches core constraint */
const MAX_MESSAGE_CHARS = 4000;

/**
 * assistant-ui ThreadMessageLike wire format
 * content is array of parts (currently only text, future: tool-call, tool-result)
 */
const ChatMessagePartSchema = z.object({
  type: z.literal("text"),
  text: z.string().max(MAX_MESSAGE_CHARS),
});

/**
 * Base message schema for output
 * - id: client or server generated UUID
 * - role: user or assistant (no system from client)
 * - createdAt: ISO timestamp
 * - content: array of message parts
 * - requestId: optional, only present on assistant messages from server
 */
export const ChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  createdAt: z.string(),
  content: z.array(ChatMessagePartSchema),
  requestId: z.string().optional(),
});

/**
 * assistant-ui message schema (from useDataStreamRuntime)
 * Simpler than output - no id or createdAt required
 */
const AssistantUiMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.union([
    z.string(), // system messages are plain string
    z.array(ChatMessagePartSchema), // user/assistant messages have parts
  ]),
});

/**
 * assistant-ui input schema
 * Used by useDataStreamRuntime from @assistant-ui/react-data-stream
 */
export const AssistantUiInputSchema = z.object({
  /** Message history */
  messages: z.array(AssistantUiMessageSchema),
  /** Model ID */
  model: z.string(),
  /** System prompt (optional) */
  system: z.string().optional(),
  /** Tools (optional, ignored for now) */
  tools: z.record(z.string(), z.unknown()).optional(),
});

export const aiChatOperation = {
  id: "ai.chat.v1",
  summary: "Chat with AI via assistant-ui streaming",
  description:
    "Send chat messages and receive streaming responses via assistant-stream",
  input: AssistantUiInputSchema,
  output: z.object({
    /** Echo back threadId (v0: same as input, v2: from DB) */
    threadId: z.string(),
    /** Assistant message with server-assigned requestId for billing reference */
    message: ChatMessageSchema.required({ requestId: true }),
  }),
} as const;

// Export inferred types - all consumers MUST use these, never manual interfaces
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ChatInput = z.infer<typeof aiChatOperation.input>;
export type AssistantUiMessage = z.infer<typeof AssistantUiMessageSchema>;
export type AssistantUiInput = z.infer<typeof AssistantUiInputSchema>;
export type ChatOutput = z.infer<typeof aiChatOperation.output>;
