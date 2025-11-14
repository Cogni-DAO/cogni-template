// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/errors`
 * Purpose: Shared error types.
 * Scope: Exports error classes and enums for cross-layer use. Does not handle error reporting.
 * Invariants: Error types are immutable and serializable
 * Side-effects: none
 * Links: Used by core domain rules and feature layers
 * @public
 */

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
