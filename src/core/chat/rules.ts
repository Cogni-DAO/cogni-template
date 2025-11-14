// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@core/chat/rules`
 * Purpose: Pure business rules and validation for chat functionality.
 * Scope: Deterministic validation with actionable errors. Does not handle I/O or time dependencies.
 * Invariants: All functions are pure, deterministic, and idempotent
 * Side-effects: none (throws on validation failure)
 * Notes: Char-based trimming heuristic for v0, handles multi-byte chars correctly
 * Links: Used by features for business rule enforcement
 * @public
 */

import { type Message, type MessageRole } from "./model";

// Constants and errors defined in core
export const MAX_MESSAGE_CHARS = 4000;

export enum ChatErrorCode {
  MESSAGE_TOO_LONG = "MESSAGE_TOO_LONG",
  INVALID_CONTENT = "INVALID_CONTENT",
}

export class ChatValidationError extends Error {
  constructor(
    public code: ChatErrorCode,
    message: string
  ) {
    super(message);
    this.name = "ChatValidationError";
  }
}

/**
 * Parameterized validation - throws ChatValidationError on failure
 * @param content - Message content to validate
 * @param maxChars - Maximum allowed character count
 * @throws ChatValidationError when content exceeds limit
 */
export function assertMessageLength(content: string, maxChars: number): void {
  // Handle multi-byte characters correctly with proper length calculation
  const actualLength = Array.from(content).length;

  if (actualLength > maxChars) {
    throw new ChatValidationError(
      ChatErrorCode.MESSAGE_TOO_LONG,
      `Message length ${actualLength} exceeds maximum ${maxChars} characters`
    );
  }
}

/**
 * Char-based trimming: deterministic, idempotent heuristic for v0
 * Explicitly documented - NOT token-based, handles multi-byte chars correctly
 * @param messages - Array of messages to trim
 * @param maxChars - Maximum total character count to preserve
 * @returns Trimmed messages array, removing oldest messages to fit limit
 */
export function trimConversationHistory(
  messages: Message[],
  maxChars: number
): Message[] {
  if (messages.length === 0) return messages;

  // Calculate total length using multi-byte aware counting
  let totalLength = 0;
  for (const message of messages) {
    totalLength += Array.from(message.content).length;
  }

  // Return unchanged if within limit
  if (totalLength <= maxChars) return messages;

  // Remove oldest messages until we fit the limit
  const result = [...messages];
  let currentLength = totalLength;

  while (result.length > 1 && currentLength > maxChars) {
    const removedMessage = result.shift();
    if (!removedMessage) break;
    currentLength -= Array.from(removedMessage.content).length;
  }

  return result;
}

/**
 * System message filtering (server-side only)
 * @param messages - Array of messages to filter
 * @returns Messages with system messages removed
 */
export function filterSystemMessages(messages: Message[]): Message[] {
  return messages.filter((message) => message.role !== "system");
}

/**
 * Role normalization and validation
 * @param role - Raw role string from client
 * @returns Normalized MessageRole or null if invalid
 */
export function normalizeMessageRole(role: string): MessageRole | null {
  const normalized = role.toLowerCase().trim();

  switch (normalized) {
    case "user":
      return "user";
    case "assistant":
      return "assistant";
    case "system":
      return "system";
    default:
      return null;
  }
}
