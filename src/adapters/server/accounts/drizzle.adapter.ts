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
import {
  AccountNotFoundPortError,
  InsufficientCreditsPortError,
} from "@/ports";
import { accounts, creditLedger } from "@/shared/db";
import { deriveAccountIdFromApiKey } from "@/shared/util";

type QueryableDb = Pick<Database, "query">;

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
      throw new AccountNotFoundPortError(accountId);
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
      await this.ensureAccountExists(tx, accountId);

      // Insert ledger entry (source of truth)
      await tx.insert(creditLedger).values({
        accountId,
        delta: this.fromNumber(-cost),
        reason: "ai_usage",
        reference: requestId,
        metadata: metadata ?? null,
      });

      // Update computed balance atomically
      const [updatedAccount] = await tx
        .update(accounts)
        .set({
          balanceCredits: sql`balance_credits - ${this.fromNumber(cost)}`,
        })
        .where(eq(accounts.id, accountId))
        .returning({ balanceCredits: accounts.balanceCredits });

      if (!updatedAccount) {
        throw new AccountNotFoundPortError(accountId);
      }

      const newBalance = this.toNumber(updatedAccount.balanceCredits);

      if (newBalance < 0) {
        const previousBalance = Number((newBalance + cost).toFixed(2));
        throw new InsufficientCreditsPortError(
          accountId,
          cost,
          previousBalance < 0 ? 0 : previousBalance
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
  }): Promise<{ newBalance: number }> {
    return await this.db.transaction(async (tx) => {
      await this.ensureAccountExists(tx, accountId);

      await tx.insert(creditLedger).values({
        accountId,
        delta: this.fromNumber(amount),
        reason,
        reference: reference ?? null,
        metadata: null,
      });

      const [updatedAccount] = await tx
        .update(accounts)
        .set({
          balanceCredits: sql`balance_credits + ${this.fromNumber(amount)}`,
        })
        .where(eq(accounts.id, accountId))
        .returning({ balanceCredits: accounts.balanceCredits });

      if (!updatedAccount) {
        throw new AccountNotFoundPortError(accountId);
      }

      return { newBalance: this.toNumber(updatedAccount.balanceCredits) };
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

  private async ensureAccountExists(
    tx: QueryableDb,
    accountId: string
  ): Promise<void> {
    const account = await tx.query.accounts.findFirst({
      where: eq(accounts.id, accountId),
    });

    if (!account) {
      throw new AccountNotFoundPortError(accountId);
    }
  }
}
