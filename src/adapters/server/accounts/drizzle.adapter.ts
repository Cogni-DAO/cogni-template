// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/accounts/drizzle`
 * Purpose: DrizzleAccountService implementation for PostgreSQL billing account operations.
 * Scope: Implements AccountService port with ledger-based credit accounting and virtual key management. Does not handle authentication or business rules.
 * Invariants: All credit operations are atomic, ledger is source of truth, billing_accounts.balance_credits is computed cache
 * Side-effects: IO (database operations)
 * Notes: Uses transactions for consistency, throws port errors for business rule violations
 * Links: Implements AccountService port, uses shared database schema
 * @public
 */

import { randomBytes, randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import type { Database } from "@/adapters/server/db/client";
import {
  type AccountService,
  type BillingAccount,
  BillingAccountNotFoundPortError,
  type CreditLedgerEntry,
  InsufficientCreditsPortError,
  VirtualKeyNotFoundPortError,
} from "@/ports";
import { billingAccounts, creditLedger, virtualKeys } from "@/shared/db";
import { serverEnv } from "@/shared/env";

const ZERO = 0;

interface QueryableDb extends Pick<Database, "query" | "insert"> {
  query: Database["query"];
  insert: Database["insert"];
}

interface VirtualKeyRow {
  id: string;
  litellmVirtualKey: string;
}

type CreditLedgerRow = typeof creditLedger.$inferSelect;

export class DrizzleAccountService implements AccountService {
  constructor(private readonly db: Database) {}

  async getOrCreateBillingAccountForUser({
    userId,
    displayName,
  }: {
    userId: string;
    walletAddress?: string;
    displayName?: string;
  }): Promise<BillingAccount> {
    return await this.db.transaction(async (tx) => {
      const existingAccount = await tx.query.billingAccounts.findFirst({
        where: eq(billingAccounts.ownerUserId, userId),
      });

      if (existingAccount) {
        const defaultKey = await this.findDefaultKey(tx, existingAccount.id);
        return {
          id: existingAccount.id,
          ownerUserId: existingAccount.ownerUserId,
          balanceCredits: this.toNumber(existingAccount.balanceCredits),
          defaultVirtualKeyId: defaultKey.id,
          litellmVirtualKey: defaultKey.litellmVirtualKey,
        };
      }

      const billingAccountId = randomUUID();

      await tx.insert(billingAccounts).values({
        id: billingAccountId,
        ownerUserId: userId,
        balanceCredits: ZERO,
        // Display name intentionally optional; stored later when UX surfaces exist
      });

      const createdKey = await this.insertDefaultKey(
        tx,
        billingAccountId,
        displayName ? { label: displayName } : {}
      );

      return {
        id: billingAccountId,
        ownerUserId: userId,
        balanceCredits: 0,
        defaultVirtualKeyId: createdKey.id,
        litellmVirtualKey: createdKey.litellmVirtualKey,
      };
    });
  }

  async getBalance(billingAccountId: string): Promise<number> {
    const account = await this.db.query.billingAccounts.findFirst({
      where: eq(billingAccounts.id, billingAccountId),
    });

    if (!account) {
      throw new BillingAccountNotFoundPortError(billingAccountId);
    }

    return this.toNumber(account.balanceCredits);
  }

  async debitForUsage({
    billingAccountId,
    virtualKeyId,
    cost,
    requestId,
    metadata,
  }: {
    billingAccountId: string;
    virtualKeyId: string;
    cost: number;
    requestId: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.ensureBillingAccountExists(tx, billingAccountId);
      await this.ensureVirtualKeyExists(tx, billingAccountId, virtualKeyId);

      const normalizedCost = this.normalizeAmount(cost, {
        enforceMinimumOne: true,
      });
      const amount = this.fromNumber(-normalizedCost);

      const [updatedAccount] = await tx
        .update(billingAccounts)
        .set({
          balanceCredits: sql`balance_credits + ${amount}`,
        })
        .where(eq(billingAccounts.id, billingAccountId))
        .returning({ balanceCredits: billingAccounts.balanceCredits });

      if (!updatedAccount) {
        throw new BillingAccountNotFoundPortError(billingAccountId);
      }

      const newBalance = this.toNumber(updatedAccount.balanceCredits);

      await tx.insert(creditLedger).values({
        billingAccountId,
        virtualKeyId,
        amount,
        balanceAfter: this.fromNumber(newBalance),
        reason: "ai_usage",
        reference: requestId,
        metadata: metadata ?? null,
      });

      if (newBalance < 0) {
        const previousBalance = newBalance + normalizedCost;
        throw new InsufficientCreditsPortError(
          billingAccountId,
          normalizedCost,
          previousBalance < 0 ? 0 : previousBalance
        );
      }
    });
  }

  async creditAccount({
    billingAccountId,
    amount,
    reason,
    reference,
    virtualKeyId,
    metadata,
  }: {
    billingAccountId: string;
    amount: number;
    reason: string;
    reference?: string;
    virtualKeyId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ newBalance: number }> {
    return await this.db.transaction(async (tx) => {
      await this.ensureBillingAccountExists(tx, billingAccountId);
      const resolvedVirtualKeyId =
        virtualKeyId ?? (await this.findDefaultKey(tx, billingAccountId)).id;

      const normalizedAmount = this.normalizeAmount(amount);
      const amountDecimal = this.fromNumber(normalizedAmount);

      const [updatedAccount] = await tx
        .update(billingAccounts)
        .set({
          balanceCredits: sql`balance_credits + ${amountDecimal}`,
        })
        .where(eq(billingAccounts.id, billingAccountId))
        .returning({ balanceCredits: billingAccounts.balanceCredits });

      if (!updatedAccount) {
        throw new BillingAccountNotFoundPortError(billingAccountId);
      }

      const newBalance = this.toNumber(updatedAccount.balanceCredits);

      await tx.insert(creditLedger).values({
        billingAccountId,
        virtualKeyId: resolvedVirtualKeyId,
        amount: amountDecimal,
        balanceAfter: this.fromNumber(newBalance),
        reason,
        reference: reference ?? null,
        metadata: metadata ?? null,
      });

      return { newBalance };
    });
  }

  async listCreditLedgerEntries({
    billingAccountId,
    limit,
    reason,
  }: {
    billingAccountId: string;
    limit?: number | undefined;
    reason?: string | undefined;
  }): Promise<CreditLedgerEntry[]> {
    const where = reason
      ? and(
          eq(creditLedger.billingAccountId, billingAccountId),
          eq(creditLedger.reason, reason)
        )
      : eq(creditLedger.billingAccountId, billingAccountId);

    const rows = await this.db.query.creditLedger.findMany({
      where,
      orderBy: (ledger, { desc: orderDesc }) => orderDesc(ledger.createdAt),
      ...(limit ? { limit } : {}),
    });

    return rows.map((row) => this.mapLedgerRow(row));
  }

  async findCreditLedgerEntryByReference({
    billingAccountId,
    reason,
    reference,
  }: {
    billingAccountId: string;
    reason: string;
    reference: string;
  }): Promise<CreditLedgerEntry | null> {
    const entry = await this.db.query.creditLedger.findFirst({
      where: and(
        eq(creditLedger.billingAccountId, billingAccountId),
        eq(creditLedger.reason, reason),
        eq(creditLedger.reference, reference)
      ),
      orderBy: (ledger, { desc: orderDesc }) => orderDesc(ledger.createdAt),
    });

    return entry ? this.mapLedgerRow(entry) : null;
  }

  private async ensureBillingAccountExists(
    tx: QueryableDb,
    billingAccountId: string
  ): Promise<void> {
    const account = await tx.query.billingAccounts.findFirst({
      where: eq(billingAccounts.id, billingAccountId),
    });

    if (!account) {
      throw new BillingAccountNotFoundPortError(billingAccountId);
    }
  }

  private async ensureVirtualKeyExists(
    tx: QueryableDb,
    billingAccountId: string,
    virtualKeyId: string
  ): Promise<void> {
    const key = await tx.query.virtualKeys.findFirst({
      where: and(
        eq(virtualKeys.billingAccountId, billingAccountId),
        eq(virtualKeys.id, virtualKeyId)
      ),
    });

    if (!key) {
      throw new VirtualKeyNotFoundPortError(billingAccountId, virtualKeyId);
    }
  }

  private async findDefaultKey(
    tx: QueryableDb,
    billingAccountId: string
  ): Promise<VirtualKeyRow> {
    const defaultKey = await tx.query.virtualKeys.findFirst({
      where: and(
        eq(virtualKeys.billingAccountId, billingAccountId),
        eq(virtualKeys.isDefault, true)
      ),
    });

    if (!defaultKey) {
      throw new VirtualKeyNotFoundPortError(billingAccountId);
    }

    return {
      id: defaultKey.id,
      litellmVirtualKey: defaultKey.litellmVirtualKey,
    };
  }

  private async insertDefaultKey(
    tx: QueryableDb,
    billingAccountId: string,
    params: { label?: string }
  ): Promise<VirtualKeyRow> {
    const env = serverEnv();

    // In test mode, avoid network calls and generate deterministic key
    if (env.isTestMode) {
      const fakeKey = this.generateVirtualKey(billingAccountId);
      const [created] = await tx
        .insert(virtualKeys)
        .values({
          billingAccountId,
          litellmVirtualKey: fakeKey,
          label: params.label ?? "Default",
          isDefault: true,
          active: true,
        })
        .returning({
          id: virtualKeys.id,
          litellmVirtualKey: virtualKeys.litellmVirtualKey,
        });

      if (!created) {
        throw new VirtualKeyNotFoundPortError(billingAccountId);
      }

      return created;
    }

    const response = await fetch(`${env.LITELLM_BASE_URL}/key/generate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.LITELLM_MASTER_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        metadata: { cogni_billing_account_id: billingAccountId },
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to generate LiteLLM virtual key: ${response.status} ${response.statusText}`
      );
    }

    const json = (await response.json()) as { key?: string };
    const litellmVirtualKey = json.key;

    if (!litellmVirtualKey) {
      throw new Error("LiteLLM response missing key");
    }

    const [created] = await tx
      .insert(virtualKeys)
      .values({
        billingAccountId,
        litellmVirtualKey,
        label: params.label ?? "Default",
        isDefault: true,
        active: true,
      })
      .returning({
        id: virtualKeys.id,
        litellmVirtualKey: virtualKeys.litellmVirtualKey,
      });

    if (!created) {
      throw new VirtualKeyNotFoundPortError(billingAccountId);
    }

    return created;
  }

  private toNumber(value: number | string | bigint): number {
    return typeof value === "number" ? value : Number(value);
  }

  private fromNumber(num: number): number {
    return num;
  }

  private generateVirtualKey(billingAccountId: string): string {
    const randomSegment = randomBytes(16).toString("base64url");
    return `vk-${billingAccountId.slice(0, 8)}-${randomSegment}`;
  }

  private normalizeAmount(
    rawAmount: number,
    options: { enforceMinimumOne?: boolean } = {}
  ): number {
    const rounded = Math.round(rawAmount);
    if (options.enforceMinimumOne && rounded === 0) {
      return 1;
    }
    return rounded;
  }

  private mapLedgerRow(row: CreditLedgerRow): CreditLedgerEntry {
    return {
      id: row.id,
      billingAccountId: row.billingAccountId,
      virtualKeyId: row.virtualKeyId,
      amount: this.toNumber(row.amount),
      balanceAfter: this.toNumber(row.balanceAfter),
      reason: row.reason,
      reference: row.reference ?? null,
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
      createdAt: row.createdAt,
    };
  }
}
