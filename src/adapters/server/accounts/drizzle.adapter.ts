// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/accounts/drizzle`
 * Purpose: DrizzleAccountService implementation for PostgreSQL account operations.
 * Scope: Implements AccountService port with ledger-based credit accounting. Does not handle authentication or business rules.
 * Invariants: All credit operations are atomic, ledger is source of truth, accounts.balance_credits is computed cache
 * Side-effects: IO (database operations)
 * Notes: Uses transactions for consistency, throws domain errors for business rule violations
 * Links: Implements AccountService port, uses shared database schema
 * @public
 */

import { eq, sql } from "drizzle-orm";

import type { Database } from "@/adapters/server/db/client";
import type { AccountService } from "@/ports";
import { accounts } from "@/shared/db";
import { deriveAccountIdFromApiKey } from "@/shared/util";

/**
 * PostgreSQL implementation of AccountService using Drizzle ORM
 *
 * CRITICAL TRANSACTION SEMANTICS:
 * - All credit operations MUST be wrapped in a single db.transaction()
 * - InsufficientCreditsError MUST NOT be caught within the transaction
 * - On error, the transaction rolls back: no ledger entry, no balance change
 * - This prevents persisting negative balances or incomplete ledger entries
 */
export class DrizzleAccountService implements AccountService {
  constructor(private readonly db: Database) {}

  async createAccountForApiKey({
    apiKey,
    displayName,
  }: {
    apiKey: string;
    displayName?: string;
  }): Promise<{ accountId: string; balanceCredits: number }> {
    const accountId = deriveAccountIdFromApiKey(apiKey);

    await this.db.transaction(async (tx) => {
      // Only create if doesn't exist (idempotent)
      const existing = await tx.query.accounts.findFirst({
        where: eq(accounts.id, accountId),
      });

      if (!existing) {
        await tx.insert(accounts).values({
          id: accountId,
          balanceCredits: "0.00",
          displayName: displayName ?? null,
        });
      }
    });

    return { accountId, balanceCredits: 0 };
  }

  async getAccountByApiKey(apiKey: string): Promise<{
    accountId: string;
    balanceCredits: number;
  } | null> {
    const accountId = deriveAccountIdFromApiKey(apiKey);

    const account = await this.db.query.accounts.findFirst({
      where: eq(accounts.id, accountId),
    });

    if (!account) return null;

    return {
      accountId: account.id,
      balanceCredits: this.toNumber(account.balanceCredits),
    };
  }

  async getBalance(accountId: string): Promise<number> {
    const account = await this.db.query.accounts.findFirst({
      where: eq(accounts.id, accountId),
    });

    if (!account) {
      throw new Error(`Account not found: ${accountId}`);
    }

    return this.toNumber(account.balanceCredits);
  }

  async debitForUsage({
    accountId,
    cost,
    requestId,
    metadata,
  }: {
    accountId: string;
    cost: number;
    requestId: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.db.transaction(async (tx) => {
      // TODO: Insert ledger entry (source of truth)
      // This will be implemented when we add the credit_ledger table
      console.log("requestId: %s", requestId);
      console.log("cost: %s", cost);
      console.log("accountId: %s\n", accountId);
      console.log("metadata: %s\n\n", JSON.stringify(metadata));

      // Update computed balance
      await tx
        .update(accounts)
        .set({
          balanceCredits: sql`balance_credits - ${this.fromNumber(cost)}`,
        })
        .where(eq(accounts.id, accountId));

      // Verify sufficient balance after update
      const account = await tx.query.accounts.findFirst({
        where: eq(accounts.id, accountId),
      });

      if (!account || this.toNumber(account.balanceCredits) < 0) {
        // Transaction will rollback - no persistence of negative balance
        throw new Error(
          `Insufficient credits for account ${accountId}: required ${cost}, available ${account ? this.toNumber(account.balanceCredits) + cost : 0}`
        );
      }
    });
  }

  async creditAccount({
    accountId,
    amount,
    reason,
    reference,
  }: {
    accountId: string;
    amount: number;
    reason: string;
    reference?: string;
  }): Promise<void> {
    await this.db.transaction(async (tx) => {
      // TODO: Insert ledger entry (source of truth)
      // This will be implemented when we add the credit_ledger table
      console.log(
        "creditAccount - reason: %s, reference: %s",
        reason,
        reference
      );

      // Update computed balance
      await tx
        .update(accounts)
        .set({
          balanceCredits: sql`balance_credits + ${this.fromNumber(amount)}`,
        })
        .where(eq(accounts.id, accountId));
    });
  }

  /**
   * Convert Drizzle decimal string to number
   * Handles the impedance mismatch between domain (number) and database (decimal)
   */
  private toNumber(decimal: string): number {
    return parseFloat(decimal);
  }

  /**
   * Convert number to decimal string for database
   * Ensures proper precision for monetary values
   */
  private fromNumber(num: number): string {
    return num.toFixed(2);
  }
}
