// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@core/accounts/model`
 * Purpose: Account domain entities and pure business logic.
 * Scope: Clean domain types with no infrastructure dependencies. Does not handle persistence or external services.
 * Invariants: Uses clean number types, no infrastructure leakage
 * Side-effects: none (pure domain logic)
 * Notes: Domain uses number for credits, adapters handle Decimal conversions
 * Links: Used by ports and features, implemented by adapters
 * @public
 */

import { InsufficientCreditsError } from "./errors";

/**
 * Account domain entity
 * Clean domain representation without infrastructure concerns
 */
export interface Account {
  /** Account identifier - maps to LlmCaller.accountId */
  id: string;
  /** Credit balance as number (adapters convert to/from database Decimal) */
  balanceCredits: number;
  /** Optional human-readable display name */
  displayName?: string;
}

/**
 * Pure domain function to validate credit availability
 * Throws domain error if insufficient credits
 *
 * @param account - Account to check
 * @param cost - Required credit cost
 * @throws {@link InsufficientCreditsError} When account has insufficient credits
 */
export function ensureHasCredits(account: Account, cost: number): void {
  if (account.balanceCredits < cost) {
    throw new InsufficientCreditsError(
      account.id,
      cost,
      account.balanceCredits
    );
  }
}

/**
 * Pure domain function to check if account has sufficient credits
 * Non-throwing alternative to ensureHasCredits
 *
 * @param account - Account to check
 * @param cost - Required credit cost
 * @returns true if account has sufficient credits
 */
export function hasSufficientCredits(account: Account, cost: number): boolean {
  return account.balanceCredits >= cost;
}
