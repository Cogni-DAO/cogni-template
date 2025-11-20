// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@core/accounts/public`
 * Purpose: Public API for accounts domain - controlled entry point for features.
 * Scope: Exposes core account entities and business rules. Does not expose internal implementation details.
 * Invariants: Only exports public domain API, no internal implementation details
 * Side-effects: none
 * Notes: Controlled entry point for hexagonal architecture boundaries
 * Links: Used by features, enforced by ESLint boundaries
 * @public
 */

export {
  AccountNotFoundError,
  InsufficientCreditsError,
  isAccountNotFoundError,
  isInsufficientCreditsError,
  isUnknownApiKeyError,
  UnknownApiKeyError,
} from "./errors";
export type { Account } from "./model";
export { ensureHasCredits, hasSufficientCredits } from "./model";
