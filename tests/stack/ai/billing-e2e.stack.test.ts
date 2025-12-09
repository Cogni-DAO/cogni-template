// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/stack/ai/billing-e2e.stack.test`
 * Purpose: Stack test verifying billing flow from completion to ledger using fake LLM adapter.
 * Scope: Tests completion route, charge_receipts insertion, credit_ledger debit, summary endpoint. Does not test LiteLLM integration.
 * Invariants: Uses APP_ENV=test (fake adapter); seeds test data; validates atomic billing transaction
 * Side-effects: IO (database writes, HTTP requests)
 * Notes: Verifies billingStatus='billed', cost tracking, balance consistency with deterministic fake costs
 * Links: None
 * @internal
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

// Mock getSessionUser
vi.mock("@/app/_lib/auth/session", () => ({
  getSessionUser: vi.fn(),
}));

import { TEST_MODEL_ID } from "@tests/_fakes";
import { getDb } from "@/adapters/server/db/client";
import { getSessionUser } from "@/app/_lib/auth/session";
import { POST as completionPOST } from "@/app/api/v1/ai/completion/route";
import { GET as summaryGET } from "@/app/api/v1/payments/credits/summary/route";
import type { SessionUser } from "@/shared/auth";
import {
  billingAccounts,
  chargeReceipts,
  creditLedger,
  users,
  virtualKeys,
} from "@/shared/db/schema";

describe("Billing E2E Stack Test", () => {
  it("should verify full billing flow: completion -> debit -> ledger -> summary", async () => {
    // 1. Setup
    // Ensure we are in test mode to use FakeLlmAdapter
    if (process.env.APP_ENV !== "test") {
      throw new Error(
        "This test must run in APP_ENV=test to use FakeLlmAdapter"
      );
    }

    const mockSessionUser: SessionUser = {
      id: randomUUID(),
      walletAddress: "0x9999999999999999999999999999999999999999",
    };

    vi.mocked(getSessionUser).mockResolvedValue(mockSessionUser);

    const db = getDb();

    // Clean up previous run if exists (cascades to billing accounts, ledger, usage)
    await db.delete(users).where(eq(users.id, mockSessionUser.id));

    // Seed user
    await db.insert(users).values({
      id: mockSessionUser.id,
      name: "E2E Test User",
      walletAddress: mockSessionUser.walletAddress,
    });

    // Seed billing account with protocol-scale credits
    // Protocol scale: 10M credits = $1 USD. Seed with $10 worth for safety margin.
    const billingAccountId = randomUUID();
    await db.insert(billingAccounts).values({
      id: billingAccountId,
      ownerUserId: mockSessionUser.id,
      balanceCredits: 100_000_000n, // 100M credits = $10 (protocol scale)
    });

    // Seed virtual key (scope/FK handle only)
    const virtualKeyId = randomUUID();
    await db.insert(virtualKeys).values({
      id: virtualKeyId,
      billingAccountId,
      isDefault: true,
    });

    // 2. Call Completion (T1 start)
    const completionReq = new NextRequest(
      "http://localhost:3000/api/v1/ai/completion",
      {
        method: "POST",
        body: JSON.stringify({
          messages: [{ role: "user", content: "Hello E2E" }],
          model: TEST_MODEL_ID,
        }),
      }
    );

    const completionRes = await completionPOST(completionReq);
    expect(completionRes.status).toBe(200);
    const completionJson = await completionRes.json();

    // Capture requestId from response
    const requestId = completionJson.message.requestId;
    expect(requestId).toBeDefined();

    // 3. Verify DB Invariants (T3) - per ACTIVITY_METRICS.md
    // Query charge_receipt WHERE request_id=requestId
    const receipt = await db.query.chargeReceipts.findFirst({
      where: eq(chargeReceipts.requestId, requestId),
    });
    expect(receipt).toBeDefined();
    expect(receipt?.billingAccountId).toBe(billingAccountId);
    expect(receipt?.provenance).toBe("response"); // Non-streaming

    // Query credit_ledger WHERE reference=requestId
    const ledgerRows = await db.query.creditLedger.findMany({
      where: eq(creditLedger.reference, requestId),
    });
    expect(ledgerRows).toHaveLength(1);
    const ledger = ledgerRows[0];
    if (!ledger) throw new Error("Ledger row not found");

    // Assert amount === -chargedCredits using BigInt math
    if (!receipt?.chargedCredits) throw new Error("Charge receipt not found");
    const chargedCredits = receipt.chargedCredits;
    const amount = ledger.amount;
    expect(amount).toBe(-chargedCredits);

    // Check balance
    const account = await db.query.billingAccounts.findFirst({
      where: eq(billingAccounts.id, billingAccountId),
    });
    // Balance = initial (100M) + debit (negative amount)
    expect(account?.balanceCredits).toBe(100_000_000n + amount);

    // 4. Verify Summary Endpoint (T2)
    const summaryReq = new NextRequest(
      "http://localhost:3000/api/v1/payments/credits/summary?limit=10"
    );
    const summaryRes = await summaryGET(summaryReq);
    expect(summaryRes.status).toBe(200);
    const summaryJson = await summaryRes.json();

    // Assert summary endpoint returns that same reference/requestId in its ledger[0]
    expect(summaryJson.ledger.length).toBeGreaterThan(0);
    const summaryEntry = summaryJson.ledger.find(
      (l: { reference: string }) => l.reference === requestId
    );
    expect(summaryEntry).toBeDefined();
    expect(summaryEntry.amount).toBe(Number(amount));

    // 5. UI-consistency stack test
    expect(summaryJson.billingAccountId).toBe(billingAccountId);
    expect(summaryJson.balanceCredits).toBe(Number(100_000_000n + amount));

    // Cleanup (cascades to billing_accounts, credit_ledger, charge_receipts)
    await db.delete(users).where(eq(users.id, mockSessionUser.id));
  });
});
