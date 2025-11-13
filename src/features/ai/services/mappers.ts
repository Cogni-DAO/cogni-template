// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/ai/mappers`
 * Purpose: DTO mapping for AI feature - isolates core types from external layers
 * Scope: Maps between DTOs and core domain types with validation
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
  normalizeMessageRole,
} from "@/core";

export interface MessageDto {
  role: "user" | "assistant";
  content: string;
  timestamp?: string | undefined;
}

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
