// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/ai/mappers`
 * Purpose: DTO mapping for AI feature - isolates core types from external layers.
 * Scope: Maps between DTOs and core domain types with validation. Does not handle external API calls or database operations.
 * Invariants: Pure functions, no side effects, proper error handling
 * Side-effects: none
 * Notes: Keeps core types isolated while enabling proper DTO translation
 * Links: Used by app facades, works with core domain
 * @public
 */

import {
  ChatErrorCode,
  ChatValidationError,
  type Message,
  type MessageToolCall,
  normalizeMessageRole,
} from "@/core";

/**
 * Tool call structure in DTO format.
 * Matches route.ts MessageToolCall and core MessageToolCall.
 */
export interface MessageDtoToolCall {
  /** Unique ID for this tool call */
  id: string;
  /** Tool name */
  name: string;
  /** JSON-encoded arguments string */
  arguments: string;
}

/**
 * Message DTO for completion facade.
 * Supports user, assistant (with optional tool calls), and tool (with tool result) messages.
 */
export interface MessageDto {
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp?: string | undefined;
  /** Tool calls made by assistant (only for role: "assistant") */
  toolCalls?: MessageDtoToolCall[];
  /** Tool call ID this message responds to (only for role: "tool") */
  toolCallId?: string;
}

/**
 * Convert DTOs to core Message format.
 *
 * Handles:
 * - user: plain text message
 * - assistant: text + optional tool calls
 * - tool: tool result with required toolCallId
 *
 * @throws ChatValidationError if role invalid or tool message missing toolCallId
 */
export function toCoreMessages(
  dtos: MessageDto[],
  timestamp: string
): Message[] {
  return dtos.map((dto) => {
    const normalizedRole = normalizeMessageRole(dto.role);
    if (!normalizedRole || normalizedRole === "system") {
      throw new ChatValidationError(
        ChatErrorCode.INVALID_CONTENT,
        `Invalid role: ${dto.role}`
      );
    }

    // Tool messages require toolCallId
    if (normalizedRole === "tool") {
      if (!dto.toolCallId) {
        throw new ChatValidationError(
          ChatErrorCode.INVALID_CONTENT,
          "Tool message missing required toolCallId"
        );
      }
      return {
        role: normalizedRole,
        content: dto.content,
        toolCallId: dto.toolCallId,
        timestamp,
      };
    }

    // Assistant messages may have tool calls
    if (normalizedRole === "assistant" && dto.toolCalls?.length) {
      const toolCalls: MessageToolCall[] = dto.toolCalls.map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments,
      }));
      return {
        role: normalizedRole,
        content: dto.content,
        toolCalls,
        timestamp,
      };
    }

    // User/assistant without tool calls
    return {
      role: normalizedRole,
      content: dto.content,
      timestamp,
    };
  });
}

export function fromCoreMessage(msg: Message): {
  role: "assistant";
  content: string;
  timestamp: string;
} {
  return {
    role: "assistant",
    content: msg.content,
    timestamp: msg.timestamp ?? new Date().toISOString(),
  };
}
