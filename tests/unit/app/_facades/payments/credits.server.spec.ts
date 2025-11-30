// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/_facades/payments/credits.server`
 * Purpose: Verifies credits confirm facade wiring and error mapping.
 * Scope: Covers app-layer orchestration with mocked container, auth mapping, and feature service; does not test feature service internals or port implementations.
 * Invariants: Billing account resolved from session; foreign key errors map to AUTH_USER_NOT_FOUND; delegates to feature service with correct payload.
 * Side-effects: none
 * Notes: Uses mocked AccountService, createContainer, and feature service.
 * Links: docs/DEPAY_PAYMENTS.md, src/app/_facades/payments/credits.server.ts
 * @public
 */

import { createMockAccountService, makeTestCtx } from "@tests/_fakes";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { confirmCreditsPaymentFacade } from "@/app/_facades/payments/credits.server";
import { getContainer } from "@/bootstrap/container";
import { confirmCreditsPayment } from "@/features/payments/services/creditsConfirm";
import { getOrCreateBillingAccountForUser } from "@/lib/auth/mapping";
import type { AccountService } from "@/ports";
import type { SessionUser } from "@/shared/auth";
import type { RequestContext } from "@/shared/observability";

vi.mock("@/bootstrap/container", () => ({
  getContainer: vi.fn(),
}));

vi.mock("@/lib/auth/mapping", () => ({
  getOrCreateBillingAccountForUser: vi.fn(),
}));

vi.mock("@/features/payments/services/creditsConfirm", () => ({
  confirmCreditsPayment: vi.fn(),
}));

const mockGetContainer = vi.mocked(getContainer);
const mockConfirmCreditsPayment = vi.mocked(confirmCreditsPayment);
const mockGetOrCreateBillingAccountForUser = vi.mocked(
  getOrCreateBillingAccountForUser
);

describe("app/_facades/payments/credits.server", () => {
  const sessionUser: SessionUser = {
    id: "user-123",
    walletAddress: "0xabc",
  };

  let accountService: AccountService;
  let testCtx: RequestContext;

  beforeEach(() => {
    vi.clearAllMocks();
    accountService = createMockAccountService();

    testCtx = makeTestCtx();

    mockGetContainer.mockReturnValue({
      accountService,
      // Unused in this facade, but required by Container type
      log: {} as never,
      llmService: {} as never,
      clock: testCtx.clock as never,
      paymentAttemptRepository: {} as never,
      onChainVerifier: {} as never,
    });
  });

  it("resolves billing account from session and delegates to confirm service", async () => {
    mockGetOrCreateBillingAccountForUser.mockResolvedValue({
      id: "billing-1",
      ownerUserId: sessionUser.id,
      balanceCredits: 0,
      defaultVirtualKeyId: "vk-1",
      litellmVirtualKey: "vk-test",
    });

    mockConfirmCreditsPayment.mockResolvedValue({
      billingAccountId: "billing-1",
      balanceCredits: 2_000,
      creditsApplied: 1_000,
    });

    const result = await confirmCreditsPaymentFacade(
      {
        sessionUser,
        amountUsdCents: 100,
        clientPaymentId: "payment-xyz",
        metadata: { source: "test" },
      },
      testCtx
    );

    expect(mockGetContainer).toHaveBeenCalledTimes(1);
    expect(mockGetOrCreateBillingAccountForUser).toHaveBeenCalledWith(
      accountService,
      {
        userId: sessionUser.id,
        walletAddress: sessionUser.walletAddress,
      }
    );

    expect(mockConfirmCreditsPayment).toHaveBeenCalledWith(accountService, {
      billingAccountId: "billing-1",
      defaultVirtualKeyId: "vk-1",
      amountUsdCents: 100,
      clientPaymentId: "payment-xyz",
      metadata: { source: "test" },
    });

    expect(result).toEqual({
      billingAccountId: "billing-1",
      balanceCredits: 2_000,
    });
  });

  it("maps foreign key errors to AUTH_USER_NOT_FOUND", async () => {
    mockGetOrCreateBillingAccountForUser.mockRejectedValue(
      new Error("billing_accounts_owner_user_id_users_id_fk")
    );

    await expect(
      confirmCreditsPaymentFacade(
        {
          sessionUser,
          amountUsdCents: 100,
          clientPaymentId: "payment-err",
        },
        testCtx
      )
    ).rejects.toThrow("AUTH_USER_NOT_FOUND");
  });
});
