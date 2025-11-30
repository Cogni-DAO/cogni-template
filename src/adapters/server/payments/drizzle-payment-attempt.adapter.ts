// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/payments/drizzle-payment-attempt`
 * Purpose: Drizzle-based implementation of PaymentAttemptRepository for PostgreSQL persistence.
 * Scope: Implements payment attempt persistence and audit logging. Does not validate state transitions or perform business logic.
 * Invariants: All operations atomic via transactions; partial unique index enforces no duplicate txHash per chain; dumb persistence only
 * Side-effects: IO (database operations)
 * Notes: State transition validation is feature layer responsibility via core/rules.isValidTransition(); repository just persists.
 * Links: Implements PaymentAttemptRepository port
 * @public
 */

import { and, eq, sql } from "drizzle-orm";

import type { Database } from "@/adapters/server/db/client";
import type {
  CreatePaymentAttemptParams,
  LogPaymentEventParams,
  PaymentAttempt,
  PaymentAttemptRepository,
  PaymentAttemptStatus,
  PaymentErrorCode,
} from "@/ports";
import {
  PaymentAttemptNotFoundPortError,
  TxHashAlreadyBoundPortError,
} from "@/ports";
import { paymentAttempts, paymentEvents } from "@/shared/db";

type PaymentAttemptRow = typeof paymentAttempts.$inferSelect;

export class DrizzlePaymentAttemptRepository
  implements PaymentAttemptRepository
{
  constructor(private readonly db: Database) {}

  async create(params: CreatePaymentAttemptParams): Promise<PaymentAttempt> {
    return await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(paymentAttempts)
        .values({
          billingAccountId: params.billingAccountId,
          fromAddress: params.fromAddress,
          chainId: params.chainId,
          token: params.token,
          toAddress: params.toAddress,
          amountRaw: params.amountRaw,
          amountUsdCents: params.amountUsdCents,
          status: "CREATED_INTENT",
          expiresAt: params.expiresAt,
        })
        .returning();

      if (!row) {
        throw new Error("Failed to create payment attempt");
      }

      // Log creation event atomically
      await this.logEventInTx(tx, {
        attemptId: row.id,
        eventType: "INTENT_CREATED",
        fromStatus: null,
        toStatus: "CREATED_INTENT",
      });

      return this.mapRow(row);
    });
  }

  async findById(
    id: string,
    billingAccountId: string
  ): Promise<PaymentAttempt | null> {
    const row = await this.db.query.paymentAttempts.findFirst({
      where: and(
        eq(paymentAttempts.id, id),
        eq(paymentAttempts.billingAccountId, billingAccountId)
      ),
    });

    return row ? this.mapRow(row) : null;
  }

  async findByTxHash(
    chainId: number,
    txHash: string
  ): Promise<PaymentAttempt | null> {
    const row = await this.db.query.paymentAttempts.findFirst({
      where: and(
        eq(paymentAttempts.chainId, chainId),
        eq(paymentAttempts.txHash, txHash)
      ),
    });

    return row ? this.mapRow(row) : null;
  }

  async updateStatus(
    id: string,
    status: PaymentAttemptStatus,
    errorCode?: PaymentErrorCode
  ): Promise<PaymentAttempt> {
    return await this.db.transaction(async (tx) => {
      const existing = await tx.query.paymentAttempts.findFirst({
        where: eq(paymentAttempts.id, id),
      });

      if (!existing) {
        throw new PaymentAttemptNotFoundPortError(id);
      }

      const [updated] = await tx
        .update(paymentAttempts)
        .set({
          status,
          errorCode: errorCode ?? null,
        })
        .where(eq(paymentAttempts.id, id))
        .returning();

      if (!updated) {
        throw new PaymentAttemptNotFoundPortError(
          id,
          existing.billingAccountId
        );
      }

      // Log status transition
      await this.logEventInTx(tx, {
        attemptId: id,
        eventType: "STATUS_CHANGED",
        fromStatus: existing.status as PaymentAttemptStatus,
        toStatus: status,
        ...(errorCode ? { errorCode } : {}),
      });

      return this.mapRow(updated);
    });
  }

  async bindTxHash(
    id: string,
    txHash: string,
    submittedAt: Date
  ): Promise<PaymentAttempt> {
    return await this.db.transaction(async (tx) => {
      // Check for existing attempt with this txHash
      const existing = await tx.query.paymentAttempts.findFirst({
        where: eq(paymentAttempts.id, id),
      });

      if (!existing) {
        throw new PaymentAttemptNotFoundPortError(id);
      }

      // Check if txHash already used by different attempt
      const duplicate = await tx.query.paymentAttempts.findFirst({
        where: and(
          eq(paymentAttempts.chainId, existing.chainId),
          eq(paymentAttempts.txHash, txHash)
        ),
      });

      if (duplicate && duplicate.id !== id) {
        throw new TxHashAlreadyBoundPortError(
          txHash,
          existing.chainId,
          duplicate.id
        );
      }

      const [updated] = await tx
        .update(paymentAttempts)
        .set({
          txHash,
          submittedAt,
          expiresAt: null,
          status: "PENDING_UNVERIFIED",
        })
        .where(eq(paymentAttempts.id, id))
        .returning();

      if (!updated) {
        throw new PaymentAttemptNotFoundPortError(
          id,
          existing.billingAccountId
        );
      }

      // Log submission event
      await this.logEventInTx(tx, {
        attemptId: id,
        eventType: "TX_SUBMITTED",
        fromStatus: existing.status as PaymentAttemptStatus,
        toStatus: "PENDING_UNVERIFIED",
        metadata: { txHash },
      });

      return this.mapRow(updated);
    });
  }

  async recordVerificationAttempt(
    id: string,
    attemptedAt: Date
  ): Promise<PaymentAttempt> {
    return await this.db.transaction(async (tx) => {
      const existing = await tx.query.paymentAttempts.findFirst({
        where: eq(paymentAttempts.id, id),
      });

      if (!existing) {
        throw new PaymentAttemptNotFoundPortError(id);
      }

      const [updated] = await tx
        .update(paymentAttempts)
        .set({
          lastVerifyAttemptAt: attemptedAt,
          verifyAttemptCount: sql`${paymentAttempts.verifyAttemptCount} + 1`,
        })
        .where(eq(paymentAttempts.id, id))
        .returning();

      if (!updated) {
        throw new PaymentAttemptNotFoundPortError(id, "unknown");
      }

      // Log verification attempt
      await this.logEventInTx(tx, {
        attemptId: id,
        eventType: "VERIFICATION_ATTEMPTED",
        fromStatus: existing.status as PaymentAttemptStatus,
        toStatus: existing.status as PaymentAttemptStatus,
      });

      return this.mapRow(updated);
    });
  }

  async logEvent(params: LogPaymentEventParams): Promise<void> {
    await this.db.insert(paymentEvents).values({
      attemptId: params.attemptId,
      eventType: params.eventType,
      fromStatus: params.fromStatus,
      toStatus: params.toStatus,
      errorCode: params.errorCode ?? null,
      metadata: params.metadata ?? null,
    });
  }

  private async logEventInTx(
    tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
    params: LogPaymentEventParams
  ): Promise<void> {
    await tx.insert(paymentEvents).values({
      attemptId: params.attemptId,
      eventType: params.eventType,
      fromStatus: params.fromStatus,
      toStatus: params.toStatus,
      errorCode: params.errorCode ?? null,
      metadata: params.metadata ?? null,
    });
  }

  private mapRow(row: PaymentAttemptRow): PaymentAttempt {
    return {
      id: row.id,
      billingAccountId: row.billingAccountId,
      fromAddress: row.fromAddress,
      chainId: row.chainId,
      txHash: row.txHash,
      token: row.token,
      toAddress: row.toAddress,
      amountRaw: row.amountRaw,
      amountUsdCents: row.amountUsdCents,
      status: row.status as PaymentAttemptStatus,
      errorCode: (row.errorCode as PaymentErrorCode) ?? null,
      expiresAt: row.expiresAt,
      submittedAt: row.submittedAt,
      lastVerifyAttemptAt: row.lastVerifyAttemptAt,
      verifyAttemptCount: row.verifyAttemptCount,
      createdAt: row.createdAt,
    };
  }
}
