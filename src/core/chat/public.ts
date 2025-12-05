// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@core/chat/public`
 * Purpose: Public API for chat domain - allowed entry point for features.
 * Scope: Exposes core domain entities and business rules. Does not expose internal implementation details.
 * Invariants: Only exports public domain API, no internal implementation details
 * Side-effects: none
 * Notes: Controlled entry point for hexagonal architecture boundaries
 * Links: Used by features, enforced by ESLint boundaries
 * @public
 */

export * from "./model";
export {
  assertMessageLength,
  ChatErrorCode,
  ChatValidationError,
  filterSystemMessages,
  MAX_MESSAGE_CHARS,
  normalizeMessageRole,
  pickDefaultModel,
  trimConversationHistory,
} from "./rules";
