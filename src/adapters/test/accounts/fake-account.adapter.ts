// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/test/accounts/fake-account`
 * Purpose: In-memory fake AccountService implementation for testing.
 * Scope: Test double with controllable behavior for unit tests. Does not persist data.
 * Invariants: Predictable behavior, no external dependencies
 * Side-effects: none (in-memory only)
 * Notes: Used for unit tests and when APP_ENV=test
 * Links: Implements AccountService port
 * @public
 */

import type { AccountService } from "@/ports";
import { deriveAccountIdFromApiKey } from "@/shared/util";

export class FakeAccountService implements AccountService {
  private accounts = new Map<
    string,
    {
      accountId: string;
      balanceCredits: number;
      displayName?: string;
    }
  >();

  constructor() {
    // Pre-populate common test accounts for integration tests
    this.createTestAccountSync("test-api-key", 100);
    this.createTestAccountSync("another-test-key", 50);
  }

  private createTestAccountSync(apiKey: string, balance: number): void {
    const accountId = deriveAccountIdFromApiKey(apiKey);
    this.accounts.set(accountId, {
      accountId,
      balanceCredits: balance,
      displayName: `Test Account for ${apiKey}`,
    });
  }

  async createAccountForApiKey({
    apiKey,
    displayName,
  }: {
    apiKey: string;
    displayName?: string;
  }): Promise<{ accountId: string; balanceCredits: number }> {
    const accountId = deriveAccountIdFromApiKey(apiKey);

    if (!this.accounts.has(accountId)) {
      this.accounts.set(accountId, {
        accountId,
        balanceCredits: 0,
        ...(displayName && { displayName }),
      });
    }

    return { accountId, balanceCredits: 0 };
  }

  async getAccountByApiKey(apiKey: string): Promise<{
    accountId: string;
    balanceCredits: number;
  } | null> {
    const accountId = deriveAccountIdFromApiKey(apiKey);
    const account = this.accounts.get(accountId);

    return account
      ? {
          accountId: account.accountId,
          balanceCredits: account.balanceCredits,
        }
      : null;
  }

  async getBalance(accountId: string): Promise<number> {
    const account = this.accounts.get(accountId);
    if (!account) {
      throw new Error(`Account not found: ${accountId}`);
    }
    return account.balanceCredits;
  }

  async debitForUsage({
    accountId,
    cost,
  }: {
    accountId: string;
    cost: number;
    requestId: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const account = this.accounts.get(accountId);
    if (!account) {
      throw new Error(`Account not found: ${accountId}`);
    }

    if (account.balanceCredits < cost) {
      throw new Error(
        `Insufficient credits for account ${accountId}: required ${cost}, available ${account.balanceCredits}`
      );
    }

    account.balanceCredits -= cost;
  }

  async creditAccount({
    accountId,
    amount,
  }: {
    accountId: string;
    amount: number;
    reason: string;
    reference?: string;
  }): Promise<void> {
    const account = this.accounts.get(accountId);
    if (!account) {
      throw new Error(`Account not found: ${accountId}`);
    }

    account.balanceCredits += amount;
  }

  // Test utilities
  setAccountBalance(accountId: string, balance: number): void {
    const account = this.accounts.get(accountId);
    if (account) {
      account.balanceCredits = balance;
    }
  }

  clear(): void {
    this.accounts.clear();
  }
}
