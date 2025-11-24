// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/_facades/payments/credits.server`
 * Purpose: App-layer wiring for widget payments. Resolves dependencies and delegates to feature services.
 * Scope: Server-only facade. Handles billing account resolution from session user and maps to feature inputs; does not perform direct persistence or HTTP handling.
 * Invariants: Billing account comes exclusively from session identity; no body-provided account identifiers.
 * Side-effects: IO (via AccountService port).
 * Notes: Errors bubble to route handlers for HTTP mapping.
 * Links: docs/DEPAY_PAYMENTS.md
 * @public
 */

import { createContainer } from "@/bootstrap/container";
import { confirmCreditsPayment } from "@/features/payments/services/creditsConfirm";
import { getCreditsSummary } from "@/features/payments/services/creditsSummary";
import { getOrCreateBillingAccountForUser } from "@/lib/auth/mapping";
import type { SessionUser } from "@/shared/auth";

export async function confirmCreditsPaymentFacade(params: {
  sessionUser: SessionUser;
  amountUsdCents: number;
  clientPaymentId: string;
  metadata?: Record<string, unknown> | undefined;
}): Promise<{ billingAccountId: string; balanceCredits: number }> {
  const { accountService } = createContainer();

  let billingAccount;
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
}): Promise<{
  billingAccountId: string;
  balanceCredits: number;
  ledger: {
    id: string;
    amount: number;
    balanceAfter: number;
    reason: string;
    reference: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
  }[];
}> {
  const { accountService } = createContainer();

  let billingAccount;
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

  return getCreditsSummary(accountService, {
    billingAccountId: billingAccount.id,
    limit: params.limit,
  });
}
