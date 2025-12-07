// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/integration/ai/drizzle.usage.adapter.int.test`
 * Purpose: Integration tests for DrizzleUsageAdapter with real PostgreSQL database.
 * Scope: Tests account isolation, cursor pagination, and bucket determinism invariants. Does not test UI or API layer.
 * Invariants:
 * - inv_account_scope_is_absolute: User A cannot see User B's data
 * - inv_cursor_is_opaque_and_safe: Pagination is stable and scoped
 * - inv_zero_fill_is_deterministic: Buckets are deterministic for range
 * - inv_money_precision: Totals match sum of buckets
 * Side-effects: IO (database operations via testcontainers)
 * Notes: These are invariant-locking tests - if these fail, the feature is broken.
 * Links: [DrizzleUsageAdapter](../../../src/adapters/server/accounts/drizzle.usage.adapter.ts)
 * @public
 */

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DrizzleAccountService } from "@/adapters/server/accounts/drizzle.adapter";
import { DrizzleUsageAdapter } from "@/adapters/server/accounts/drizzle.usage.adapter";
import type { Database } from "@/adapters/server/db/client";
import { getDb } from "@/adapters/server/db/client";
import {
  billingAccounts,
  creditLedger,
  llmUsage,
  users,
  virtualKeys,
} from "@/shared/db/schema";

// Test fixtures
interface TestAccount {
  userId: string;
  billingAccountId: string;
  virtualKeyId: string;
}

describe("DrizzleUsageAdapter Integration Tests", () => {
  let db: Database;
  let adapter: DrizzleUsageAdapter;

  // Two completely separate test accounts
  let accountA: TestAccount;
  let accountB: TestAccount;

  beforeAll(async () => {
    db = getDb();
    adapter = new DrizzleUsageAdapter(db);

    // Create Account A
    accountA = {
      userId: randomUUID(),
      billingAccountId: randomUUID(),
      virtualKeyId: randomUUID(),
    };

    // Create Account B
    accountB = {
      userId: randomUUID(),
      billingAccountId: randomUUID(),
      virtualKeyId: randomUUID(),
    };

    // Seed users
    await db.insert(users).values([
      {
        id: accountA.userId,
        name: "User A",
        walletAddress: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      },
      {
        id: accountB.userId,
        name: "User B",
        walletAddress: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
      },
    ]);

    // Seed billing accounts
    await db.insert(billingAccounts).values([
      {
        id: accountA.billingAccountId,
        ownerUserId: accountA.userId,
        balanceCredits: 1000n,
      },
      {
        id: accountB.billingAccountId,
        ownerUserId: accountB.userId,
        balanceCredits: 1000n,
      },
    ]);

    // Seed virtual keys
    await db.insert(virtualKeys).values([
      {
        id: accountA.virtualKeyId,
        billingAccountId: accountA.billingAccountId,
        litellmVirtualKey: "vk-a",
        isDefault: true,
      },
      {
        id: accountB.virtualKeyId,
        billingAccountId: accountB.billingAccountId,
        litellmVirtualKey: "vk-b",
        isDefault: true,
      },
    ]);

    // Seed charge receipts for Account A (5 records over 3 days)
    // Per ACTIVITY_METRICS.md: no model/tokens/usage - LiteLLM is canonical
    const baseDate = new Date("2024-06-15T00:00:00Z");
    await db.insert(llmUsage).values([
      {
        id: randomUUID(),
        billingAccountId: accountA.billingAccountId,
        virtualKeyId: accountA.virtualKeyId,
        requestId: "req-a-1",
        litellmCallId: "call-a-1",
        chargedCredits: 5000n,
        responseCostUsd: "0.005000",
        provenance: "response",
        createdAt: new Date(baseDate.getTime()),
      },
      {
        id: randomUUID(),
        billingAccountId: accountA.billingAccountId,
        virtualKeyId: accountA.virtualKeyId,
        requestId: "req-a-2",
        litellmCallId: "call-a-2",
        chargedCredits: 10000n,
        responseCostUsd: "0.010000",
        provenance: "response",
        createdAt: new Date(baseDate.getTime() + 1000 * 60 * 60), // +1 hour
      },
      {
        id: randomUUID(),
        billingAccountId: accountA.billingAccountId,
        virtualKeyId: accountA.virtualKeyId,
        requestId: "req-a-3",
        litellmCallId: "call-a-3",
        chargedCredits: 1000n,
        responseCostUsd: "0.001000",
        provenance: "response",
        createdAt: new Date(baseDate.getTime() + 1000 * 60 * 60 * 24), // +1 day
      },
      {
        id: randomUUID(),
        billingAccountId: accountA.billingAccountId,
        virtualKeyId: accountA.virtualKeyId,
        requestId: "req-a-4",
        litellmCallId: "call-a-4",
        chargedCredits: 15000n,
        responseCostUsd: "0.015000",
        provenance: "stream",
        createdAt: new Date(baseDate.getTime() + 1000 * 60 * 60 * 24 * 2), // +2 days
      },
      {
        id: randomUUID(),
        billingAccountId: accountA.billingAccountId,
        virtualKeyId: accountA.virtualKeyId,
        requestId: "req-a-5",
        litellmCallId: "call-a-5",
        chargedCredits: 20000n,
        responseCostUsd: "0.020000",
        provenance: "stream",
        createdAt: new Date(
          baseDate.getTime() + 1000 * 60 * 60 * 24 * 2 + 1000
        ), // +2 days +1s
      },
    ]);

    // Seed charge receipts for Account B (3 records, different amounts)
    // Per ACTIVITY_METRICS.md: no model/tokens/usage - LiteLLM is canonical
    await db.insert(llmUsage).values([
      {
        id: randomUUID(),
        billingAccountId: accountB.billingAccountId,
        virtualKeyId: accountB.virtualKeyId,
        requestId: "req-b-1",
        litellmCallId: "call-b-1",
        chargedCredits: 100000n,
        responseCostUsd: "0.100000",
        provenance: "response",
        createdAt: new Date(baseDate.getTime()),
      },
      {
        id: randomUUID(),
        billingAccountId: accountB.billingAccountId,
        virtualKeyId: accountB.virtualKeyId,
        requestId: "req-b-2",
        litellmCallId: "call-b-2",
        chargedCredits: 200000n,
        responseCostUsd: "0.200000",
        provenance: "response",
        createdAt: new Date(baseDate.getTime() + 1000 * 60 * 60 * 24), // +1 day
      },
      {
        id: randomUUID(),
        billingAccountId: accountB.billingAccountId,
        virtualKeyId: accountB.virtualKeyId,
        requestId: "req-b-3",
        litellmCallId: "call-b-3",
        chargedCredits: 50000n,
        responseCostUsd: "0.050000",
        provenance: "stream",
        createdAt: new Date(baseDate.getTime() + 1000 * 60 * 60 * 24 * 2), // +2 days
      },
    ]);
  });

  afterAll(async () => {
    // Cleanup (cascades via FK)
    await db.delete(users).where(eq(users.id, accountA.userId));
    await db.delete(users).where(eq(users.id, accountB.userId));
  });

  describe("inv_account_scope_is_absolute", () => {
    it("Account A stats query returns ONLY Account A data", async () => {
      const from = new Date("2024-06-14T00:00:00Z");
      const to = new Date("2024-06-18T00:00:00Z");

      const result = await adapter.getUsageStats({
        billingAccountId: accountA.billingAccountId,
        from,
        to,
        groupBy: "day",
      });

      // Account A has 5 records with total cost = 0.005 + 0.01 + 0.001 + 0.015 + 0.02 = 0.051
      // Account A requests = 5
      // NOTE: tokens = 0 in fallback mode (LiteLLM is canonical per ACTIVITY_METRICS.md)
      expect(result.totals.requests).toBe(5);
      expect(result.totals.tokens).toBe(0); // Fallback mode - no tokens
      expect(Number.parseFloat(result.totals.spend)).toBeCloseTo(0.051, 5);
      expect(result.telemetrySource).toBe("fallback");

      // Verify no Account B data leaked (B has much higher costs: 0.35 total)
      expect(Number.parseFloat(result.totals.spend)).toBeLessThan(0.1);
    });

    it("Account B stats query returns ONLY Account B data", async () => {
      const from = new Date("2024-06-14T00:00:00Z");
      const to = new Date("2024-06-18T00:00:00Z");

      const result = await adapter.getUsageStats({
        billingAccountId: accountB.billingAccountId,
        from,
        to,
        groupBy: "day",
      });

      // Account B has 3 records with total cost = 0.1 + 0.2 + 0.05 = 0.35
      // Account B requests = 3
      // NOTE: tokens = 0 in fallback mode (LiteLLM is canonical per ACTIVITY_METRICS.md)
      expect(result.totals.requests).toBe(3);
      expect(result.totals.tokens).toBe(0); // Fallback mode - no tokens
      expect(Number.parseFloat(result.totals.spend)).toBeCloseTo(0.35, 5);
      expect(result.telemetrySource).toBe("fallback");

      // Verify no Account A data leaked
      expect(Number.parseFloat(result.totals.spend)).toBeGreaterThan(0.3);
    });

    it("Account A logs query returns ONLY Account A records", async () => {
      const result = await adapter.listUsageLogs({
        billingAccountId: accountA.billingAccountId,
        limit: 100,
      });

      expect(result.logs).toHaveLength(5);
      expect(result.telemetrySource).toBe("fallback");

      // In fallback mode, model = "unavailable" (LiteLLM is canonical)
      const models = result.logs.map((l) => l.model);
      expect(models.every((m) => m === "unavailable")).toBe(true);
    });

    it("Account B logs query returns ONLY Account B records", async () => {
      const result = await adapter.listUsageLogs({
        billingAccountId: accountB.billingAccountId,
        limit: 100,
      });

      expect(result.logs).toHaveLength(3);
      expect(result.telemetrySource).toBe("fallback");

      // In fallback mode, model = "unavailable" (LiteLLM is canonical)
      const models = result.logs.map((l) => l.model);
      expect(models.every((m) => m === "unavailable")).toBe(true);
    });

    it("Non-existent account returns empty results, not other accounts data", async () => {
      const fakeAccountId = randomUUID();

      const statsResult = await adapter.getUsageStats({
        billingAccountId: fakeAccountId,
        from: new Date("2024-06-14T00:00:00Z"),
        to: new Date("2024-06-18T00:00:00Z"),
        groupBy: "day",
      });

      expect(statsResult.totals.requests).toBe(0);
      expect(statsResult.totals.tokens).toBe(0);
      expect(Number.parseFloat(statsResult.totals.spend)).toBe(0);

      const logsResult = await adapter.listUsageLogs({
        billingAccountId: fakeAccountId,
        limit: 100,
      });

      expect(logsResult.logs).toHaveLength(0);
    });
  });

  describe("inv_cursor_is_opaque_and_safe (pagination isolation)", () => {
    it("Cursor from Account A cannot be used to access Account B data", async () => {
      // Get first page of Account A with cursor
      const firstPage = await adapter.listUsageLogs({
        billingAccountId: accountA.billingAccountId,
        limit: 2,
      });

      expect(firstPage.logs).toHaveLength(2);
      expect(firstPage.nextCursor).toBeDefined();
      if (!firstPage.nextCursor) throw new Error("Expected nextCursor");

      // Try to use Account A's cursor with Account B's billingAccountId
      // This should return Account B's data (scoped by billingAccountId), not Account A's
      const crossAccountAttempt = await adapter.listUsageLogs({
        billingAccountId: accountB.billingAccountId,
        limit: 100,
        cursor: firstPage.nextCursor,
      });

      // Should return Account B's logs only, cursor filters by (createdAt, id)
      // but billingAccountId scoping is ALWAYS applied
      // In fallback mode, all models are "unavailable" - we verify isolation by count
      expect(crossAccountAttempt.logs.length).toBeLessThanOrEqual(3); // Account B has 3 records
      expect(crossAccountAttempt.telemetrySource).toBe("fallback");
    });

    it("Pagination returns stable ordering across pages", async () => {
      // Fetch all Account A records in one page
      const allAtOnce = await adapter.listUsageLogs({
        billingAccountId: accountA.billingAccountId,
        limit: 100,
      });

      // Fetch in pages of 2
      const page1 = await adapter.listUsageLogs({
        billingAccountId: accountA.billingAccountId,
        limit: 2,
      });
      if (!page1.nextCursor) throw new Error("Expected page1.nextCursor");

      const page2 = await adapter.listUsageLogs({
        billingAccountId: accountA.billingAccountId,
        limit: 2,
        cursor: page1.nextCursor,
      });
      if (!page2.nextCursor) throw new Error("Expected page2.nextCursor");

      const page3 = await adapter.listUsageLogs({
        billingAccountId: accountA.billingAccountId,
        limit: 2,
        cursor: page2.nextCursor,
      });

      // Combine paginated results
      const paginated = [...page1.logs, ...page2.logs, ...page3.logs];

      // Should have same IDs in same order
      expect(paginated.map((l) => l.id)).toEqual(
        allAtOnce.logs.map((l) => l.id)
      );

      // No duplicates
      const ids = paginated.map((l) => l.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe("inv_zero_fill_is_deterministic", () => {
    it("Same range always produces same bucket count", async () => {
      const from = new Date("2024-06-15T00:00:00Z");
      const to = new Date("2024-06-18T00:00:00Z");

      const result1 = await adapter.getUsageStats({
        billingAccountId: accountA.billingAccountId,
        from,
        to,
        groupBy: "day",
      });

      const result2 = await adapter.getUsageStats({
        billingAccountId: accountA.billingAccountId,
        from,
        to,
        groupBy: "day",
      });

      expect(result1.series.length).toBe(result2.series.length);
      expect(result1.series.map((b) => b.bucketStart.toISOString())).toEqual(
        result2.series.map((b) => b.bucketStart.toISOString())
      );
    });

    it("Aggregates correctly with non-aligned from date", async () => {
      const baseDate = new Date("2024-01-01T00:00:00Z");
      // Create charge receipts at 02:00 and 06:00 on day 1
      const day1_0200 = new Date(baseDate.getTime() + 1000 * 60 * 60 * 2);
      const day1_0600 = new Date(baseDate.getTime() + 1000 * 60 * 60 * 6);

      // Need a virtual key for the insert
      const [vk] = await db
        .select()
        .from(virtualKeys)
        .where(eq(virtualKeys.billingAccountId, accountA.billingAccountId))
        .limit(1);
      if (!vk) throw new Error("Expected virtual key");

      await db.insert(llmUsage).values([
        {
          id: randomUUID(),
          billingAccountId: accountA.billingAccountId,
          virtualKeyId: vk.id,
          requestId: `req-nonaligned-1-${randomUUID()}`,
          litellmCallId: "call-nonaligned-1",
          chargedCredits: 10000n,
          responseCostUsd: "0.010000",
          provenance: "response",
          createdAt: day1_0200,
        },
        {
          id: randomUUID(),
          billingAccountId: accountA.billingAccountId,
          virtualKeyId: vk.id,
          requestId: `req-nonaligned-2-${randomUUID()}`,
          litellmCallId: "call-nonaligned-2",
          chargedCredits: 10000n,
          responseCostUsd: "0.010000",
          provenance: "response",
          createdAt: day1_0600,
        },
      ]);

      // Query from 05:00 (middle of day) to +2 days
      const from = new Date(baseDate.getTime() + 1000 * 60 * 60 * 5); // 05:00
      const to = new Date(baseDate.getTime() + 1000 * 60 * 60 * 24 * 2); // +2 days

      const result = await adapter.getUsageStats({
        billingAccountId: accountA.billingAccountId,
        from,
        to,
        groupBy: "day",
      });

      // First bucket should be baseDate (00:00)
      expect(result.series[0]?.bucketStart.toISOString()).toBe(
        baseDate.toISOString()
      );

      // Should only contain the 06:00 usage (0.01 cost), not the 02:00 usage
      expect(result.series[0]?.spend).toBe("0.010000");
      expect(result.series[0]?.requests).toBe(1);
    });

    it("Empty range still produces correct bucket structure", async () => {
      const fakeAccountId = randomUUID();
      const from = new Date("2024-06-15T00:00:00Z");
      const to = new Date("2024-06-18T00:00:00Z");

      const result = await adapter.getUsageStats({
        billingAccountId: fakeAccountId,
        from,
        to,
        groupBy: "day",
      });

      // Should have 3 buckets (15, 16, 17) even with no data
      expect(result.series.length).toBe(3);

      // All buckets should be zero-filled
      for (const bucket of result.series) {
        expect(Number.parseFloat(bucket.spend)).toBe(0);
        expect(bucket.tokens).toBe(0);
        expect(bucket.requests).toBe(0);
      }
    });

    it("Hourly grouping produces correct bucket count", async () => {
      const from = new Date("2024-06-15T00:00:00Z");
      const to = new Date("2024-06-15T06:00:00Z"); // 6 hours

      const result = await adapter.getUsageStats({
        billingAccountId: accountA.billingAccountId,
        from,
        to,
        groupBy: "hour",
      });

      // Should have 6 hourly buckets
      expect(result.series.length).toBe(6);
    });
  });

  describe("inv_money_precision (totals reconciliation)", () => {
    it("Totals spend equals sum of bucket spends within precision", async () => {
      const from = new Date("2024-06-14T00:00:00Z");
      const to = new Date("2024-06-18T00:00:00Z");

      const result = await adapter.getUsageStats({
        billingAccountId: accountA.billingAccountId,
        from,
        to,
        groupBy: "day",
      });

      // Sum bucket spends
      const bucketSum = result.series.reduce(
        (sum, bucket) => sum + Number.parseFloat(bucket.spend),
        0
      );

      const totalSpend = Number.parseFloat(result.totals.spend);

      // Should be equal within floating point precision (6 decimal places)
      expect(Math.abs(bucketSum - totalSpend)).toBeLessThan(0.000001);
    });

    it("Totals tokens equals sum of bucket tokens", async () => {
      const from = new Date("2024-06-14T00:00:00Z");
      const to = new Date("2024-06-18T00:00:00Z");

      const result = await adapter.getUsageStats({
        billingAccountId: accountA.billingAccountId,
        from,
        to,
        groupBy: "day",
      });

      const bucketSum = result.series.reduce(
        (sum, bucket) => sum + bucket.tokens,
        0
      );

      expect(bucketSum).toBe(result.totals.tokens);
    });

    it("Totals requests equals sum of bucket requests", async () => {
      const from = new Date("2024-06-14T00:00:00Z");
      const to = new Date("2024-06-18T00:00:00Z");

      const result = await adapter.getUsageStats({
        billingAccountId: accountA.billingAccountId,
        from,
        to,
        groupBy: "day",
      });

      const bucketSum = result.series.reduce(
        (sum, bucket) => sum + bucket.requests,
        0
      );

      expect(bucketSum).toBe(result.totals.requests);
    });

    it("Cost decimal precision is preserved (not corrupted by float)", async () => {
      const from = new Date("2024-06-14T00:00:00Z");
      const to = new Date("2024-06-18T00:00:00Z");

      const result = await adapter.getUsageStats({
        billingAccountId: accountA.billingAccountId,
        from,
        to,
        groupBy: "day",
      });

      // Verify spend is returned as string (not float)
      expect(typeof result.totals.spend).toBe("string");

      for (const bucket of result.series) {
        expect(typeof bucket.spend).toBe("string");
      }
    });
  });

  describe("inv_charge_receipt_idempotent (per ACTIVITY_METRICS.md)", () => {
    let accountService: DrizzleAccountService;

    beforeAll(() => {
      accountService = new DrizzleAccountService(db);
    });

    it("recordChargeReceipt is idempotent - calling twice with same requestId creates exactly one receipt and one ledger entry", async () => {
      const requestId = `idem-test-${randomUUID()}`;
      const chargedCredits = 5000n;

      // Get initial balance
      const initialBalance = await accountService.getBalance(
        accountA.billingAccountId
      );

      // Call recordChargeReceipt twice with same requestId
      await accountService.recordChargeReceipt({
        billingAccountId: accountA.billingAccountId,
        virtualKeyId: accountA.virtualKeyId,
        requestId,
        chargedCredits,
        responseCostUsd: 0.005,
        litellmCallId: `call-${requestId}`,
        provenance: "response",
      });

      await accountService.recordChargeReceipt({
        billingAccountId: accountA.billingAccountId,
        virtualKeyId: accountA.virtualKeyId,
        requestId, // Same requestId - should be idempotent
        chargedCredits,
        responseCostUsd: 0.005,
        litellmCallId: `call-${requestId}`,
        provenance: "response",
      });

      // Verify exactly one charge receipt exists
      const receipts = await db
        .select()
        .from(llmUsage)
        .where(eq(llmUsage.requestId, requestId));
      expect(receipts).toHaveLength(1);

      // Verify exactly one ledger entry exists for this reference
      const ledgerEntries = await db
        .select()
        .from(creditLedger)
        .where(
          and(
            eq(creditLedger.reference, requestId),
            eq(creditLedger.reason, "llm_usage")
          )
        );
      expect(ledgerEntries).toHaveLength(1);

      // Verify balance was only debited once
      const finalBalance = await accountService.getBalance(
        accountA.billingAccountId
      );
      expect(BigInt(initialBalance) - BigInt(finalBalance)).toBe(
        chargedCredits
      );
    });

    it("different requestIds create separate receipts and ledger entries", async () => {
      const requestId1 = `diff-test-1-${randomUUID()}`;
      const requestId2 = `diff-test-2-${randomUUID()}`;
      const chargedCredits = 1000n;

      // Get initial balance
      const initialBalance = await accountService.getBalance(
        accountA.billingAccountId
      );

      // Call with two different requestIds
      await accountService.recordChargeReceipt({
        billingAccountId: accountA.billingAccountId,
        virtualKeyId: accountA.virtualKeyId,
        requestId: requestId1,
        chargedCredits,
        responseCostUsd: 0.001,
        litellmCallId: `call-${requestId1}`,
        provenance: "response",
      });

      await accountService.recordChargeReceipt({
        billingAccountId: accountA.billingAccountId,
        virtualKeyId: accountA.virtualKeyId,
        requestId: requestId2, // Different requestId
        chargedCredits,
        responseCostUsd: 0.001,
        litellmCallId: `call-${requestId2}`,
        provenance: "stream",
      });

      // Verify two charge receipts exist
      const receipts1 = await db
        .select()
        .from(llmUsage)
        .where(eq(llmUsage.requestId, requestId1));
      const receipts2 = await db
        .select()
        .from(llmUsage)
        .where(eq(llmUsage.requestId, requestId2));
      expect(receipts1).toHaveLength(1);
      expect(receipts2).toHaveLength(1);

      // Verify balance was debited twice
      const finalBalance = await accountService.getBalance(
        accountA.billingAccountId
      );
      expect(BigInt(initialBalance) - BigInt(finalBalance)).toBe(
        chargedCredits * 2n
      );
    });
  });
});
