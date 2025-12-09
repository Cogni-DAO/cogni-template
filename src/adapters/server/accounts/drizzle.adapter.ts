// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/accounts/drizzle`
 * Purpose: DrizzleAccountService implementation for PostgreSQL billing account operations with charge receipt recording.
 * Scope: Implements AccountService port with ledger-based credit accounting and virtual key management. Does not compute pricing.
 * Invariants:
 * - Atomic ops; ledger source of truth; balance cached; UUID v4 validated; request_id is idempotency key
 * - Persists chargeReason, sourceService, metadata to charge_receipts (required fields)
 * - listChargeReceipts returns sourceService for Activity UI join
 * Side-effects: IO (database operations)
 * Notes: Uses transactions for consistency; recordChargeReceipt is non-blocking (never throws InsufficientCredits per ACTIVITY_METRICS.md)
 * Links: Implements AccountService port, uses shared database schema, docs/ACTIVITY_METRICS.md, types/billing.ts
 * @public
 */

import { randomUUID } from "node:crypto";

import { and, desc, eq, gte, lt, sql } from "drizzle-orm";

import type { Database } from "@/adapters/server/db/client";
import {
  type AccountService,
  type BillingAccount,
  BillingAccountNotFoundPortError,
  type ChargeReceiptParams,
  type CreditLedgerEntry,
  InsufficientCreditsPortError,
  VirtualKeyNotFoundPortError,
} from "@/ports";
import {
  billingAccounts,
  chargeReceipts,
  creditLedger,
  virtualKeys,
} from "@/shared/db";
import { serverEnv } from "@/shared/env";
import { makeLogger } from "@/shared/observability";
import { isValidUuid } from "@/shared/util";
import type { SourceSystem } from "@/types/billing";

const logger = makeLogger({ component: "DrizzleAccountService" });

interface QueryableDb extends Pick<Database, "query" | "insert"> {
  query: Database["query"];
  insert: Database["insert"];
}

interface VirtualKeyRow {
  id: string;
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
    if (!isValidUuid(userId)) {
      const env = serverEnv();
      const dbFingerprint = `${env.DB_HOST}:${env.DB_PORT}/${env.POSTGRES_DB}`;
      throw new Error(
        `BUG: expected valid UUID v4 for owner_user_id, got: ${userId}. DB: ${dbFingerprint}`
      );
    }

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
        };
      }

      const billingAccountId = randomUUID();

      await tx.insert(billingAccounts).values({
        id: billingAccountId,
        ownerUserId: userId,
        balanceCredits: 0n,
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
      const amount = BigInt(-normalizedCost);

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

      const newBalance = updatedAccount.balanceCredits; // bigint

      await tx.insert(creditLedger).values({
        billingAccountId,
        virtualKeyId,
        amount,
        balanceAfter: newBalance,
        reason: "ai_usage",
        reference: requestId,
        metadata: metadata ?? null,
      });

      if (newBalance < 0n) {
        const previousBalance = Number(newBalance) + normalizedCost;
        throw new InsufficientCreditsPortError(
          billingAccountId,
          normalizedCost,
          previousBalance < 0 ? 0 : previousBalance
        );
      }
    });
  }

  async recordChargeReceipt(params: ChargeReceiptParams): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Idempotency check: if receipt already exists, return early
      // This prevents double-debits on retries per ACTIVITY_METRICS.md
      const existing = await tx.query.chargeReceipts.findFirst({
        where: eq(chargeReceipts.requestId, params.requestId),
      });
      if (existing) {
        logger.debug(
          { requestId: params.requestId },
          "recordChargeReceipt: idempotent return - receipt already exists"
        );
        return;
      }

      await this.ensureBillingAccountExists(tx, params.billingAccountId);
      await this.ensureVirtualKeyExists(
        tx,
        params.billingAccountId,
        params.virtualKeyId
      );

      // Insert charge receipt (unique constraint on request_id ensures no duplicates)
      await tx.insert(chargeReceipts).values({
        billingAccountId: params.billingAccountId,
        virtualKeyId: params.virtualKeyId,
        requestId: params.requestId,
        litellmCallId: params.litellmCallId,
        chargedCredits: params.chargedCredits,
        responseCostUsd: params.responseCostUsd?.toString() ?? null,
        provenance: params.provenance,
        chargeReason: params.chargeReason,
        sourceSystem: params.sourceSystem,
        sourceReference: params.sourceReference,
      });

      // Debit credits atomically (negative amount)
      const debitAmount = -params.chargedCredits;

      const [updatedAccount] = await tx
        .update(billingAccounts)
        .set({
          balanceCredits: sql`${billingAccounts.balanceCredits} + ${debitAmount}`,
        })
        .where(eq(billingAccounts.id, params.billingAccountId))
        .returning({ balanceCredits: billingAccounts.balanceCredits });

      if (!updatedAccount) {
        throw new BillingAccountNotFoundPortError(params.billingAccountId);
      }

      const newBalance = updatedAccount.balanceCredits;

      // Insert ledger entry (unique partial index ensures no duplicates for charge_receipt reason)
      await tx.insert(creditLedger).values({
        billingAccountId: params.billingAccountId,
        virtualKeyId: params.virtualKeyId,
        amount: debitAmount,
        balanceAfter: newBalance,
        reason: "charge_receipt",
        reference: params.requestId,
        metadata: null,
      });

      // INVARIANT: Never throw InsufficientCreditsPortError in post-call path
      // Log critical if balance goes negative, but complete the write
      if (newBalance < 0n) {
        logger.error(
          {
            billingAccountId: params.billingAccountId,
            requestId: params.requestId,
            chargedCredits: Number(params.chargedCredits),
            newBalance: Number(newBalance),
          },
          "inv_post_call_negative_balance: Charge receipt recorded with negative balance"
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
      const amountBigInt = BigInt(normalizedAmount);

      const [updatedAccount] = await tx
        .update(billingAccounts)
        .set({
          balanceCredits: sql`balance_credits + ${amountBigInt}`,
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
        amount: amountBigInt,
        balanceAfter: updatedAccount.balanceCredits,
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
    };
  }

  private async insertDefaultKey(
    tx: QueryableDb,
    billingAccountId: string,
    params: { label?: string }
  ): Promise<VirtualKeyRow> {
    // MVP: virtual_keys is scope/FK handle only. Auth uses LITELLM_MASTER_KEY from env.
    const [created] = await tx
      .insert(virtualKeys)
      .values({
        billingAccountId,
        label: params.label ?? "Default",
        isDefault: true,
        active: true,
      })
      .returning({
        id: virtualKeys.id,
      });

    if (!created) {
      throw new VirtualKeyNotFoundPortError(billingAccountId);
    }

    return created;
  }

  private toNumber(value: number | string | bigint): number {
    return typeof value === "number" ? value : Number(value);
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

  async listChargeReceipts(params: {
    billingAccountId: string;
    from: Date;
    to: Date;
    limit?: number;
  }): Promise<
    Array<{
      litellmCallId: string | null;
      chargedCredits: string;
      responseCostUsd: string | null;
      sourceSystem: SourceSystem;
      createdAt: Date;
    }>
  > {
    const take = Math.min(params.limit ?? 100, 1000);

    const rows = await this.db
      .select({
        litellmCallId: chargeReceipts.litellmCallId,
        chargedCredits: chargeReceipts.chargedCredits,
        responseCostUsd: chargeReceipts.responseCostUsd,
        sourceSystem: chargeReceipts.sourceSystem,
        createdAt: chargeReceipts.createdAt,
      })
      .from(chargeReceipts)
      .where(
        and(
          eq(chargeReceipts.billingAccountId, params.billingAccountId),
          gte(chargeReceipts.createdAt, params.from),
          lt(chargeReceipts.createdAt, params.to)
        )
      )
      .orderBy(desc(chargeReceipts.createdAt))
      .limit(take);

    return rows.map((r) => ({
      litellmCallId: r.litellmCallId,
      chargedCredits: String(r.chargedCredits),
      responseCostUsd: r.responseCostUsd ? String(r.responseCostUsd) : null,
      sourceSystem: r.sourceSystem as SourceSystem,
      createdAt: r.createdAt,
    }));
  }
}
