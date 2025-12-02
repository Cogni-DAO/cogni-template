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
 * Base message schema
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

export const aiChatOperation = {
  id: "ai.chat.v1",
  summary: "Chat with AI using assistant-ui format",
  description:
    "Send chat messages in assistant-ui format and receive streaming or non-streaming responses",
  input: z.object({
    /** Client-generated thread ID (v0: session-local, v2: persisted) */
    threadId: z.string(),
    /** Client-generated request ID for retry deduplication */
    clientRequestId: z.string().uuid(),
    /** Message history in assistant-ui format */
    messages: z.array(ChatMessageSchema),
  }),
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
export type ChatOutput = z.infer<typeof aiChatOperation.output>;
