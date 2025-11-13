// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@core/chat/model`
 * Purpose: Domain entities and value objects for chat functionality
 * Scope: Pure domain types with optional timestamps. Does not handle I/O or time operations.
 * Invariants: No Date objects, no I/O dependencies, purely functional types
 * Side-effects: none
 * Notes: Timestamps are optional ISO strings set by feature/route layers
 * Links: Used by ports, features, and adapters
 * @public
 */

export interface Message {
  role: MessageRole;
  content: string;
  /** ISO 8601 string, optional - set by feature layer */
  timestamp?: string;
}

export type MessageRole = "user" | "assistant" | "system";

export interface Conversation {
  id: string;
  messages: Message[];
}
