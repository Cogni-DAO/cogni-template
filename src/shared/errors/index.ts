// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/errors`
 * Purpose: Shared error types for cross-layer use.
 * Scope: Exports error classes, enums, and constants. Does not handle error reporting or logging.
 * Invariants:
 * - Error types are immutable and serializable.
 * - TooManyLogsError maps to 422 Unprocessable Entity.
 * - MAX_LOGS_PER_RANGE (5000) enforces fail-loud behavior.
 * Side-effects: none
 * Links: Used by features, adapters, and facades
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

/**
 * Maximum logs allowed per range query.
 * Prevents unbounded memory consumption and API abuse.
 * Fail loud rather than silently truncate.
 */
export const MAX_LOGS_PER_RANGE = 5000;

/**
 * Error thrown when log count exceeds MAX_LOGS_PER_RANGE.
 * Maps to 422 Unprocessable Entity - user should narrow their date range.
 * Invariant: Never silently truncate - always fail loud.
 */
export class TooManyLogsError extends Error {
  public readonly logCount: number;
  public readonly maxAllowed: number;

  constructor(logCount: number, maxAllowed: number = MAX_LOGS_PER_RANGE) {
    super(
      `Query returned ${logCount} logs, exceeding limit of ${maxAllowed}. Narrow your date range.`
    );
    this.name = "TooManyLogsError";
    this.logCount = logCount;
    this.maxAllowed = maxAllowed;
  }
}

export function isTooManyLogsError(error: Error): error is TooManyLogsError {
  return error instanceof TooManyLogsError;
}
