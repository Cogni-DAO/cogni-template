// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/stack/payments/credits-confirm.stack`
 * Purpose: Stack-level validation that confirmCreditsPaymentFacade applies widget payments idempotently.
 * Scope: Calls the real facade + DrizzleAccountService against Postgres; does not bypass ports with mocks or hit HTTP routes.
 * Invariants: Duplicate clientPaymentId does not double credit; ledger/reference remains single-entry.
 * Side-effects: IO (writes to billing tables via facade + DB).
 * Notes: Runs with stack test DB; cleans up inserted user/billing records.
 * Links: docs/DEPAY_PAYMENTS.md, src/app/_facades/payments/credits.server.ts
 * @public
 */

import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { getDb } from "@/adapters/server/db/client";
import { confirmCreditsPaymentFacade } from "@/app/_facades/payments/credits.server";
import { users } from "@/shared/db/schema.auth";
import { billingAccounts, creditLedger } from "@/shared/db/schema.billing";

describe("Credits confirm stack (idempotent on clientPaymentId)", () => {
  it("applies credits once per clientPaymentId and returns consistent balance", async () => {
    const db = getDb();
    const sessionUser = {
      id: randomUUID(), // Valid UUID v4 for testing
      walletAddress: `0x${"1".repeat(40)}`,
    };

    await db.insert(users).values({
      id: sessionUser.id,
      walletAddress: sessionUser.walletAddress,
      name: "Stack Test User",
    });

    const clientPaymentId = `stack-test-${randomUUID()}`;

    try {
      const first = await confirmCreditsPaymentFacade({
        sessionUser,
        amountUsdCents: 10,
        clientPaymentId,
        metadata: { provider: "depay", test: true },
      });

      const second = await confirmCreditsPaymentFacade({
        sessionUser,
        amountUsdCents: 10,
        clientPaymentId,
        metadata: { provider: "depay", test: true },
      });

      expect(second.balanceCredits).toBe(first.balanceCredits);

      const billingAccount = await db.query.billingAccounts.findFirst({
        where: eq(billingAccounts.ownerUserId, sessionUser.id),
      });

      expect(billingAccount).toBeTruthy();
      if (!billingAccount) {
        throw new Error("Billing account was not created");
      }

      const ledgerEntries = await db.query.creditLedger.findMany({
        where: and(
          eq(creditLedger.billingAccountId, billingAccount.id),
          eq(creditLedger.reference, clientPaymentId)
        ),
      });

      expect(ledgerEntries).toHaveLength(1);
      expect(ledgerEntries[0]?.reason).toBe("widget_payment");
      expect(Number(ledgerEntries[0]?.balanceAfter)).toBe(first.balanceCredits);
    } finally {
      // Cleanup cascades to billing/ledger via FK
      await db.delete(users).where(eq(users.id, sessionUser.id));
    }
  });
});
