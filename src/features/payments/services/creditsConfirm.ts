// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/payments/services/creditsConfirm`
 * Purpose: Confirm widget payments by crediting billing accounts via ledger writes.
 * Scope: Feature-layer orchestration for payment confirmations; does not expose HTTP handling or session resolution. Validates idempotency via ledger reference lookup.
 * Invariants: Credits are computed with integer math (1 cent = 10 credits); idempotent on clientPaymentId per billing account.
 * Side-effects: IO (via AccountService port).
 * Notes: Billing account resolution occurs at app layer; this service assumes a valid billing account and default virtual key.
 * Links: docs/DEPAY_PAYMENTS.md
 * @public
 */

import type { AccountService } from "@/ports";
import { WIDGET_PAYMENT_REASON } from "@/shared";

const CREDITS_PER_CENT = 10;

export interface CreditsConfirmInput {
  billingAccountId: string;
  defaultVirtualKeyId: string;
  amountUsdCents: number;
  clientPaymentId: string;
  metadata?: Record<string, unknown> | undefined;
}

export interface CreditsConfirmResult {
  billingAccountId: string;
  balanceCredits: number;
  creditsApplied: number;
}

export async function confirmCreditsPayment(
  accountService: AccountService,
  input: CreditsConfirmInput
): Promise<CreditsConfirmResult> {
  const existingEntry = await accountService.findCreditLedgerEntryByReference({
    billingAccountId: input.billingAccountId,
    reason: WIDGET_PAYMENT_REASON,
    reference: input.clientPaymentId,
  });

  if (existingEntry) {
    return {
      billingAccountId: input.billingAccountId,
      balanceCredits: existingEntry.balanceAfter,
      creditsApplied: 0,
    };
  }

  if (input.amountUsdCents <= 0) {
    throw new Error("amountUsdCents must be greater than zero");
  }

  const credits = input.amountUsdCents * CREDITS_PER_CENT;
  const metadata = {
    provider: "depay",
    amountUsdCents: input.amountUsdCents,
    ...(input.metadata ?? {}),
  };

  const { newBalance } = await accountService.creditAccount({
    billingAccountId: input.billingAccountId,
    amount: credits,
    reason: WIDGET_PAYMENT_REASON,
    reference: input.clientPaymentId,
    virtualKeyId: input.defaultVirtualKeyId,
    metadata,
  });

  return {
    billingAccountId: input.billingAccountId,
    balanceCredits: newBalance,
    creditsApplied: credits,
  };
}
