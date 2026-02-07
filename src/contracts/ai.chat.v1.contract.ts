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

/** Max tool name length */
const MAX_TOOL_NAME_CHARS = 64;

/** Max tool args JSON stringified length (8KB) */
const MAX_TOOL_ARGS_CHARS = 8192;

/** Max tool result JSON stringified length (32KB) */
const MAX_TOOL_RESULT_CHARS = 32768;

/** Max ID length (toolCallId, message id, requestId) */
const MAX_ID_CHARS = 128;

/**
 * Max stateKey length - app-level conversation routing key.
 * Separate from MAX_ID_CHARS to allow reasonable client-provided keys.
 */
const MAX_STATE_KEY_CHARS = 512;

/**
 * Safe character pattern for stateKey - prevents log injection.
 * Allows: alphanumeric, dots, underscores, colons, hyphens.
 */
const STATE_KEY_SAFE_PATTERN = /^[A-Za-z0-9._:-]+$/;

/**
 * JSON-serializable value schema (recursive).
 * Prevents cyclic/BigInt/Date payloads that would cause serialization errors.
 * Uses finite() to reject NaN/Infinity which JSON.stringify converts to null.
 */
const JsonLiteralSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
type JsonLiteral = z.infer<typeof JsonLiteralSchema>;
type JsonValue = JsonLiteral | JsonValue[] | { [key: string]: JsonValue };
const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    JsonLiteralSchema,
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ])
);

/**
 * Text content part - standard message text.
 */
const TextPartSchema = z.object({
  type: z.literal("text"),
  text: z.string().max(MAX_MESSAGE_CHARS),
});

/**
 * Tool call part - emitted by assistant when invoking a tool.
 * args must be JSON-serializable and within size limits.
 */
const ToolCallPartSchema = z
  .object({
    type: z.literal("tool-call"),
    toolCallId: z.string().min(1, "toolCallId required").max(MAX_ID_CHARS),
    toolName: z.string().min(1).max(MAX_TOOL_NAME_CHARS),
    args: JsonValueSchema,
  })
  .refine(
    (data) => JSON.stringify(data.args).length <= MAX_TOOL_ARGS_CHARS,
    `Tool args exceed ${MAX_TOOL_ARGS_CHARS} chars when serialized`
  );

/**
 * Tool result part - result from tool execution.
 * result must be JSON-serializable and within size limits.
 */
const ToolResultPartSchema = z
  .object({
    type: z.literal("tool-result"),
    toolCallId: z.string().min(1, "toolCallId required").max(MAX_ID_CHARS),
    result: JsonValueSchema,
  })
  .refine(
    (data) => JSON.stringify(data.result).length <= MAX_TOOL_RESULT_CHARS,
    `Tool result exceeds ${MAX_TOOL_RESULT_CHARS} chars when serialized`
  );

/**
 * Discriminated union of all content part types.
 * - text: standard message content
 * - tool-call: assistant invoking a tool
 * - tool-result: result from tool execution
 */
const ContentPartSchema = z.discriminatedUnion("type", [
  TextPartSchema,
  ToolCallPartSchema,
  ToolResultPartSchema,
]);

// Legacy alias for output schema (text-only for now)
const ChatMessagePartSchema = TextPartSchema;

/**
 * Base message schema for output
 * - id: client or server generated UUID (bounded)
 * - role: user or assistant (no system from client)
 * - createdAt: ISO 8601 datetime
 * - content: array of message parts
 * - requestId: optional, only present on assistant messages from server
 */
export const ChatMessageSchema = z.object({
  id: z.string().max(MAX_ID_CHARS),
  role: z.enum(["user", "assistant"]),
  createdAt: z.string().datetime(),
  content: z.array(ChatMessagePartSchema),
  requestId: z.string().max(MAX_ID_CHARS).optional(),
});

/**
 * assistant-ui message schema (from useDataStreamRuntime)
 * Simpler than output - no id or createdAt required.
 * Supports tool-call parts (assistant) and tool-result parts (tool role).
 *
 * Content type constraints:
 * - system: must be string
 * - user/assistant/tool: must be array of ContentPart
 *
 * Part constraints by role:
 * - user: text only
 * - assistant: text and/or tool-call (no tool-result)
 * - tool: exactly 1 tool-result (no text, no tool-call)
 */
const AssistantUiMessageSchema = z
  .object({
    role: z.enum(["user", "assistant", "system", "tool"]),
    content: z.union([
      z.string(), // system messages are plain string
      z.array(ContentPartSchema), // user/assistant/tool messages have parts
    ]),
  })
  .superRefine((msg, ctx) => {
    const isStringContent = typeof msg.content === "string";

    // Enforce content type by role
    if (msg.role === "system") {
      if (!isStringContent) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "system messages must have string content",
          path: ["content"],
        });
        return; // Can't validate parts if wrong type
      }
      return; // System messages are valid with string content
    }

    // All other roles must have array content
    if (isStringContent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${msg.role} messages must have array content`,
        path: ["content"],
      });
      return; // Can't validate parts if wrong type
    }

    // TypeScript narrowing: content is array after isStringContent check
    const parts = msg.content as z.infer<typeof ContentPartSchema>[];
    const toolCallParts = parts.filter((p) => p.type === "tool-call");
    const toolResultParts = parts.filter((p) => p.type === "tool-result");
    const textParts = parts.filter((p) => p.type === "text");

    // Cross-field constraints by role
    switch (msg.role) {
      case "user":
        // User messages: only text parts allowed
        if (toolCallParts.length > 0 || toolResultParts.length > 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "user messages can only contain text parts",
            path: ["content"],
          });
        }
        break;

      case "assistant":
        // Assistant messages: text and/or tool-call parts, no tool-result
        if (toolResultParts.length > 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "assistant messages cannot contain tool-result parts",
            path: ["content"],
          });
        }
        break;

      case "tool":
        // Tool messages: exactly 1 tool-result part, no text or tool-call
        if (textParts.length > 0 || toolCallParts.length > 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "tool messages can only contain tool-result parts",
            path: ["content"],
          });
        }
        if (toolResultParts.length !== 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "tool messages must contain exactly 1 tool-result part",
            path: ["content"],
          });
        }
        break;
    }
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
  /** Graph name or fully-qualified graphId to execute (required) */
  graphName: z.string(),
  /**
   * Conversation state key for multi-turn conversations.
   * If absent, server generates one and returns it via X-State-Key header.
   * Client should reuse for subsequent messages in same conversation.
   * Must contain only safe characters: alphanumeric, dots, underscores, colons, hyphens.
   * Note: This is an app-level key, NOT a provider-specific thread_id.
   */
  stateKey: z
    .string()
    .max(MAX_STATE_KEY_CHARS)
    .regex(STATE_KEY_SAFE_PATTERN, "stateKey must contain only safe characters")
    .optional(),
});

export const aiChatOperation = {
  id: "ai.chat.v1",
  summary: "Chat with AI via assistant-ui streaming",
  description:
    "Send chat messages and receive streaming responses via assistant-stream",
  input: AssistantUiInputSchema,
  output: z.object({
    /** Echo back stateKey for client reuse */
    stateKey: z.string(),
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

// Content part types for route processing
export type ContentPart = z.infer<typeof ContentPartSchema>;
export type TextPart = z.infer<typeof TextPartSchema>;
export type ToolCallPart = z.infer<typeof ToolCallPartSchema>;
export type ToolResultPart = z.infer<typeof ToolResultPartSchema>;
