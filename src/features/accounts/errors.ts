// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/accounts/errors`
 * Purpose: Feature-level error types for account management operations.
 * Scope: Defines errors that cross the feature boundary to app layer. Does not include internal domain errors.
 * Invariants: Stable interface for app layer error handling; maps from domain errors
 * Side-effects: none
 * Notes: App layer imports these for HTTP error mapping; features translate domain → feature errors
 * Links: Used by app routes for error handling, mapped from core domain errors
 * @public
 */

/**
 * Feature-level error algebra for accounts operations
 * Clean typed errors that cross the feature boundary to app layer
 */
export type AccountsFeatureError =
  | { kind: "UNKNOWN_API_KEY" }
  | { kind: "ACCOUNT_NOT_FOUND"; accountId: string }
  | {
      kind: "INSUFFICIENT_CREDITS";
      accountId: string;
      required: number;
      available: number;
    }
  | { kind: "GENERIC"; message: string };

/**
 * Type guard to check if error is AccountsFeatureError
 */
export function isAccountsFeatureError(
  error: unknown
): error is AccountsFeatureError {
  return (
    typeof error === "object" &&
    error !== null &&
    "kind" in error &&
    typeof (error as Record<string, unknown>).kind === "string"
  );
}
