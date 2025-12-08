// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/payments/services/creditsConfirm`
 * Purpose: Verifies widget payment confirmation service logic.
 * Scope: Covers feature-layer credit calculations, idempotency checks, and validation with mocked AccountService port; does not test port implementations or HTTP layer.
 * Invariants: 1 cent = 100,000 credits (CREDITS_PER_USD / 100); idempotent per clientPaymentId; validation on amountUsdCents.
 * Side-effects: none
 * Notes: Uses mocked AccountService with stub implementations.
 * Links: docs/DEPAY_PAYMENTS.md, src/features/payments/services/creditsConfirm.ts
 * @public
 */

import { createMockAccountService } from "@tests/_fakes";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { confirmCreditsPayment } from "@/features/payments/services/creditsConfirm";
import type { CreditLedgerEntry } from "@/ports";
import { WIDGET_PAYMENT_REASON } from "@/shared";

describe("features/payments/services/creditsConfirm", () => {
  const billingAccountId = "billing-123";
  const defaultVirtualKeyId = "vk-123";

  const createMocks = (): {
    accountService: ReturnType<typeof createMockAccountService>;
    findByReference: ReturnType<typeof vi.fn>;
    creditAccount: ReturnType<typeof vi.fn>;
  } => {
    const accountService = createMockAccountService();
    const findByReference =
      accountService.findCreditLedgerEntryByReference as unknown as ReturnType<
        typeof vi.fn
      >;
    const creditAccount = accountService.creditAccount as unknown as ReturnType<
      typeof vi.fn
    >;

    return { accountService, findByReference, creditAccount };
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("credits new payments and returns updated balance with merged metadata", async () => {
    const { accountService, findByReference, creditAccount } = createMocks();

    // 1000 cents = $10 = 100,000,000 credits (at CREDITS_PER_USD = 10,000,000)
    const expectedCredits = 100_000_000;

    findByReference.mockResolvedValue(null);
    creditAccount.mockResolvedValue({ newBalance: expectedCredits });

    const result = await confirmCreditsPayment(accountService, {
      billingAccountId,
      defaultVirtualKeyId,
      amountUsdCents: 1_000,
      clientPaymentId: "payment-1",
      metadata: { txHash: "0xabc" },
    });

    expect(findByReference).toHaveBeenCalledWith({
      billingAccountId,
      reason: WIDGET_PAYMENT_REASON,
      reference: "payment-1",
    });

    expect(creditAccount).toHaveBeenCalledWith({
      billingAccountId,
      amount: expectedCredits, // 1000 cents = $10 * 10_000_000 credits/USD
      reason: WIDGET_PAYMENT_REASON,
      reference: "payment-1",
      virtualKeyId: defaultVirtualKeyId,
      metadata: {
        provider: "depay",
        amountUsdCents: 1_000,
        txHash: "0xabc",
      },
    });

    expect(result).toEqual({
      billingAccountId,
      balanceCredits: expectedCredits,
      creditsApplied: expectedCredits,
    });
  });

  it("returns existing balance and skips crediting when ledger entry already exists", async () => {
    const { accountService, findByReference, creditAccount } = createMocks();

    const existingEntry: CreditLedgerEntry = {
      id: "ledger-1",
      billingAccountId,
      virtualKeyId: defaultVirtualKeyId,
      amount: 5_000,
      balanceAfter: 12_345,
      reason: WIDGET_PAYMENT_REASON,
      reference: "payment-duplicate",
      metadata: { original: true },
      createdAt: new Date("2025-01-01T00:00:00Z"),
    };

    findByReference.mockResolvedValue(existingEntry);

    const result = await confirmCreditsPayment(accountService, {
      billingAccountId,
      defaultVirtualKeyId,
      amountUsdCents: 500,
      clientPaymentId: "payment-duplicate",
    });

    expect(creditAccount).not.toHaveBeenCalled();
    expect(result).toEqual({
      billingAccountId,
      balanceCredits: existingEntry.balanceAfter,
      creditsApplied: 0,
    });
  });

  it("throws when amountUsdCents is not greater than zero", async () => {
    const { accountService, findByReference } = createMocks();
    findByReference.mockResolvedValue(null);

    await expect(
      confirmCreditsPayment(accountService, {
        billingAccountId,
        defaultVirtualKeyId,
        amountUsdCents: 0,
        clientPaymentId: "payment-invalid",
      })
    ).rejects.toThrow("amountUsdCents must be greater than zero");
  });
});
