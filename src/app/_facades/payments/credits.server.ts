// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/_facades/payments/credits.server`
 * Purpose: App-layer wiring for widget payments. Resolves dependencies, delegates to feature services, and maps port types to contract DTOs.
 * Scope: Server-only facade. Handles billing account resolution from session user, maps Date to ISO string for contract compliance; does not perform direct persistence or HTTP handling.
 * Invariants: Billing account from session identity only; return types use z.infer; Date fields map to ISO strings.
 * Side-effects: IO (via AccountService port).
 * Notes: Errors bubble to route handlers for HTTP mapping. Facades own DTO mapping (port types → contract types).
 * Links: docs/DEPAY_PAYMENTS.md, src/contracts/AGENTS.md
 * @public
 */

import { createContainer } from "@/bootstrap/container";
import type { CreditsConfirmOutput } from "@/contracts/payments.credits.confirm.v1.contract";
import type { CreditsSummaryOutput } from "@/contracts/payments.credits.summary.v1.contract";
import { confirmCreditsPayment } from "@/features/payments/services/creditsConfirm";
import { getCreditsSummary } from "@/features/payments/services/creditsSummary";
import { getOrCreateBillingAccountForUser } from "@/lib/auth/mapping";
import type { SessionUser } from "@/shared/auth";

export async function confirmCreditsPaymentFacade(params: {
  sessionUser: SessionUser;
  amountUsdCents: number;
  clientPaymentId: string;
  metadata?: Record<string, unknown> | undefined;
}): Promise<CreditsConfirmOutput> {
  const { accountService } = createContainer();

  let billingAccount: Awaited<
    ReturnType<typeof getOrCreateBillingAccountForUser>
  >;
  try {
    billingAccount = await getOrCreateBillingAccountForUser(accountService, {
      userId: params.sessionUser.id,
      walletAddress: params.sessionUser.walletAddress,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("billing_accounts_owner_user_id_users_id_fk")
    ) {
      throw new Error("AUTH_USER_NOT_FOUND");
    }
    throw error;
  }

  const result = await confirmCreditsPayment(accountService, {
    billingAccountId: billingAccount.id,
    defaultVirtualKeyId: billingAccount.defaultVirtualKeyId,
    amountUsdCents: params.amountUsdCents,
    clientPaymentId: params.clientPaymentId,
    metadata: params.metadata,
  });

  return {
    billingAccountId: result.billingAccountId,
    balanceCredits: result.balanceCredits,
  };
}

export async function getCreditsSummaryFacade(params: {
  sessionUser: SessionUser;
  limit?: number | undefined;
}): Promise<CreditsSummaryOutput> {
  const { accountService } = createContainer();

  let billingAccount: Awaited<
    ReturnType<typeof getOrCreateBillingAccountForUser>
  >;
  try {
    billingAccount = await getOrCreateBillingAccountForUser(accountService, {
      userId: params.sessionUser.id,
      walletAddress: params.sessionUser.walletAddress,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("billing_accounts_owner_user_id_users_id_fk")
    ) {
      throw new Error("AUTH_USER_NOT_FOUND");
    }
    throw error;
  }

  const result = await getCreditsSummary(accountService, {
    billingAccountId: billingAccount.id,
    limit: params.limit,
  });

  // Map port types (Date) to contract types (ISO string)
  return {
    billingAccountId: result.billingAccountId,
    balanceCredits: result.balanceCredits,
    ledger: result.ledger.map((entry) => ({
      id: entry.id,
      amount: entry.amount,
      balanceAfter: entry.balanceAfter,
      reason: entry.reason,
      reference: entry.reference,
      metadata: entry.metadata,
      createdAt: entry.createdAt.toISOString(),
    })),
  };
}
