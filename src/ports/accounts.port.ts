// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@ports/accounts`
 * Purpose: Account service port interface for credit accounting operations.
 * Scope: Defines contracts for account creation, validation, and credit management. Does not implement business logic.
 * Invariants: All operations are atomic, account IDs are stable, credit operations maintain ledger integrity
 * Side-effects: none (interface definition only)
 * Notes: Implemented by database adapters, used by features and admin routes
 * Links: Implemented by DrizzleAccountService, used by completion feature and admin endpoints
 * @public
 */

export interface AccountService {
  /**
   * Creates account for API key (admin endpoints only)
   * Idempotent - safe to call multiple times with same API key
   */
  createAccountForApiKey(params: {
    apiKey: string;
    displayName?: string;
  }): Promise<{ accountId: string; balanceCredits: number }>;

  /**
   * Validates account exists for API key (completion route)
   * Returns null for unknown keys - caller should return 403
   */
  getAccountByApiKey(apiKey: string): Promise<{
    accountId: string;
    balanceCredits: number;
  } | null>;

  /**
   * Reads cached balance from accounts table
   * Not recomputed from ledger for performance
   */
  getBalance(accountId: string): Promise<number>;

  /**
   * Atomic credit deduction after LLM usage
   * Prevents race conditions with single operation
   * Throws InsufficientCreditsError if balance would go negative
   */
  debitForUsage(params: {
    accountId: string;
    cost: number;
    requestId: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;

  /**
   * Credit account for funding/testing flows
   * Inserts positive delta into ledger
   */
  creditAccount(params: {
    accountId: string;
    amount: number;
    reason: string;
    reference?: string;
  }): Promise<void>;
}
