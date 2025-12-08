// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/payments/services/creditsConfirm`
 * Purpose: Confirm widget payments by crediting billing accounts via ledger writes.
 * Scope: Feature-layer orchestration for payment confirmations; does not expose HTTP handling or session resolution. Validates idempotency via ledger reference lookup.
 * Invariants: Credits computed via usdCentsToCredits (integer-only math); idempotent on clientPaymentId per billing account.
 * Side-effects: IO (via AccountService port).
 * Notes: Billing account resolution occurs at app layer; this service assumes a valid billing account and default virtual key.
 * Links: docs/DEPAY_PAYMENTS.md, src/core/billing/pricing.ts
 * @public
 */

import { usdCentsToCredits } from "@/core";
import type { AccountService } from "@/ports";
import { WIDGET_PAYMENT_REASON } from "@/shared";

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

  // Convert cents to credits using integer math (no float division)
  const creditsAsBigInt = usdCentsToCredits(input.amountUsdCents);
  // TODO: Move ledger ports to bigint; for now convert to number
  const credits = Number(creditsAsBigInt);
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
