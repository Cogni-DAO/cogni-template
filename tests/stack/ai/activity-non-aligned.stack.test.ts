// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/stack/ai/activity-non-aligned.stack.test`
 * Purpose: Stack test for Activity feature with non-aligned timestamps.
 * Scope: Tests bucket alignment bug (B2) - non-midnight/non-hour from should still show data. Does not test auth.
 * Invariants:
 * - inv_zero_fill_is_deterministic: Non-aligned from includes data in first partial bucket
 * - Charts are never all-zeros when data exists
 * - Bucket boundaries are canonical (aligned to day/hour)
 * Side-effects: IO (database writes, HTTP requests)
 * Notes: THIS TEST WILL FAIL with current implementation until B2 is fixed.
 * Links: [DrizzleUsageAdapter](../../../src/adapters/server/accounts/drizzle.usage.adapter.ts)
 * @internal
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Mock getServerSessionUser
vi.mock("@/lib/auth/server", () => ({
  getServerSessionUser: vi.fn(),
}));

import { getDb } from "@/adapters/server/db/client";
import { GET } from "@/app/api/v1/activity/route";
import { getServerSessionUser } from "@/lib/auth/server";
import type { SessionUser } from "@/shared/auth";
import {
  billingAccounts,
  llmUsage,
  users,
  virtualKeys,
} from "@/shared/db/schema";

describe("Activity Non-Aligned Timestamp Tests", () => {
  let testUserId: string;
  let testBillingAccountId: string;
  let testVirtualKeyId: string;

  beforeAll(async () => {
    if (process.env.APP_ENV !== "test") {
      throw new Error("This test must run in APP_ENV=test");
    }

    const db = getDb();

    testUserId = randomUUID();
    testBillingAccountId = randomUUID();
    testVirtualKeyId = randomUUID();

    await db.insert(users).values({
      id: testUserId,
      name: "Non-Aligned Test User",
      walletAddress: "0xNONALIGNED000000000000000000000000000000",
    });

    await db.insert(billingAccounts).values({
      id: testBillingAccountId,
      ownerUserId: testUserId,
      balanceCredits: 1000n,
    });

    await db.insert(virtualKeys).values({
      id: testVirtualKeyId,
      billingAccountId: testBillingAccountId,
      litellmVirtualKey: "vk-non-aligned",
      isDefault: true,
    });

    // Seed charge receipts at NON-ALIGNED times (per ACTIVITY_METRICS.md)
    // These should appear in the first bucket when from=05:00, groupBy=day
    await db.insert(llmUsage).values([
      {
        id: randomUUID(),
        billingAccountId: testBillingAccountId,
        virtualKeyId: testVirtualKeyId,
        requestId: "req-non-aligned-1",
        litellmCallId: "call-nonaligned-1",
        chargedCredits: 5000n,
        responseCostUsd: "0.005000",
        provenance: "response",
        createdAt: new Date("2024-06-15T06:30:00Z"), // Morning, not midnight
      },
      {
        id: randomUUID(),
        billingAccountId: testBillingAccountId,
        virtualKeyId: testVirtualKeyId,
        requestId: "req-non-aligned-2",
        litellmCallId: "call-nonaligned-2",
        chargedCredits: 10000n,
        responseCostUsd: "0.010000",
        provenance: "response",
        createdAt: new Date("2024-06-15T14:15:00Z"), // Afternoon
      },
      {
        id: randomUUID(),
        billingAccountId: testBillingAccountId,
        virtualKeyId: testVirtualKeyId,
        requestId: "req-non-aligned-3",
        litellmCallId: "call-nonaligned-3",
        chargedCredits: 15000n,
        responseCostUsd: "0.015000",
        provenance: "stream",
        createdAt: new Date("2024-06-16T09:45:00Z"), // Next day morning
      },
    ]);

    // Mock auth
    const mockUser: SessionUser = {
      id: testUserId,
      walletAddress: "0xNONALIGNED000000000000000000000000000000",
    };
    vi.mocked(getServerSessionUser).mockResolvedValue(mockUser);
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(users).where(eq(users.id, testUserId));
  });

  describe("B2: Bucket alignment with non-midnight from", () => {
    it("CRITICAL: Non-aligned from (05:00) includes data from 06:30 in first bucket", async () => {
      // Query from 05:00 (before first data at 06:30)
      const request = new NextRequest(
        "http://localhost:3000/api/v1/activity?from=2024-06-15T05:00:00Z&to=2024-06-17T00:00:00Z&groupBy=day"
      );

      const response = await GET(request);
      expect(response.status).toBe(200);

      const json = await response.json();

      // Should have 2 daily buckets: June 15 and June 16
      expect(json.chartSeries).toHaveLength(2);

      // CRITICAL: First bucket must be aligned to midnight
      expect(json.chartSeries[0].bucketStart).toBe("2024-06-15T00:00:00.000Z");

      // CRITICAL: First bucket must contain data from 06:30 and 14:15
      // Expected: 0.005 + 0.010 = 0.015
      const firstBucketSpend = Number.parseFloat(json.chartSeries[0].spend);
      expect(firstBucketSpend).toBeGreaterThan(0);
      expect(firstBucketSpend).toBeCloseTo(0.015, 5);

      // First bucket should have 2 requests
      expect(json.chartSeries[0].requests).toBe(2);

      // Second bucket (June 16) should have data from 09:45
      expect(json.chartSeries[1].bucketStart).toBe("2024-06-16T00:00:00.000Z");
      const secondBucketSpend = Number.parseFloat(json.chartSeries[1].spend);
      expect(secondBucketSpend).toBeCloseTo(0.015, 5);
      expect(json.chartSeries[1].requests).toBe(1);

      // Totals should match sum of buckets
      const totalFromBuckets =
        Number.parseFloat(json.chartSeries[0].spend) +
        Number.parseFloat(json.chartSeries[1].spend);
      const totalFromResponse = Number.parseFloat(json.totals.spend.total);
      expect(Math.abs(totalFromBuckets - totalFromResponse)).toBeLessThan(
        0.000001
      );
    });

    it("CRITICAL: Hourly groupBy with non-hour-aligned from includes data correctly", async () => {
      // Query from 06:00 (before 06:30 data) with hourly grouping
      const request = new NextRequest(
        "http://localhost:3000/api/v1/activity?from=2024-06-15T06:00:00Z&to=2024-06-15T15:00:00Z&groupBy=hour"
      );

      const response = await GET(request);
      expect(response.status).toBe(200);

      const json = await response.json();

      // Should have 9 hourly buckets (06:00-14:00)
      expect(json.chartSeries).toHaveLength(9);

      // First bucket (06:00-07:00) should contain 06:30 data
      expect(json.chartSeries[0].bucketStart).toBe("2024-06-15T06:00:00.000Z");
      const bucket6Spend = Number.parseFloat(json.chartSeries[0].spend);
      expect(bucket6Spend).toBeCloseTo(0.005, 5);
      expect(json.chartSeries[0].requests).toBe(1);

      // Bucket at 14:00 should contain 14:15 data
      const bucket14 = json.chartSeries.find((b: { bucketStart: string }) =>
        b.bucketStart.startsWith("2024-06-15T14:")
      );
      expect(bucket14).toBeDefined();
      expect(Number.parseFloat(bucket14.spend)).toBeCloseTo(0.01, 5);
      expect(bucket14.requests).toBe(1);
    });

    it("Non-aligned from with NO data in range returns zero-filled buckets", async () => {
      // Query a range with no data (future dates)
      const request = new NextRequest(
        "http://localhost:3000/api/v1/activity?from=2025-01-15T05:30:00Z&to=2025-01-17T00:00:00Z&groupBy=day"
      );

      const response = await GET(request);
      expect(response.status).toBe(200);

      const json = await response.json();

      // Should have 2 buckets, all zeros
      expect(json.chartSeries).toHaveLength(2);

      for (const bucket of json.chartSeries) {
        expect(Number.parseFloat(bucket.spend)).toBe(0);
        expect(bucket.tokens).toBe(0);
        expect(bucket.requests).toBe(0);
      }

      // Totals should be zero
      expect(Number.parseFloat(json.totals.spend.total)).toBe(0);
      expect(json.totals.tokens.total).toBe(0);
      expect(json.totals.requests.total).toBe(0);
    });

    it("Bucket boundaries are ALWAYS canonical (aligned) regardless of from", async () => {
      // Query with extremely non-aligned from
      const request = new NextRequest(
        "http://localhost:3000/api/v1/activity?from=2024-06-15T05:37:42.123Z&to=2024-06-17T00:00:00Z&groupBy=day"
      );

      const response = await GET(request);
      expect(response.status).toBe(200);

      const json = await response.json();

      // All bucketStart values must be midnight UTC
      for (const bucket of json.chartSeries) {
        expect(bucket.bucketStart).toMatch(/T00:00:00\.000Z$/);
      }
    });
  });

  describe("Edge cases with partial buckets", () => {
    it("from and to in same bucket returns single bucket with data", async () => {
      // Both times on June 15, should return 1 bucket
      const request = new NextRequest(
        "http://localhost:3000/api/v1/activity?from=2024-06-15T05:00:00Z&to=2024-06-15T23:00:00Z&groupBy=day"
      );

      const response = await GET(request);
      expect(response.status).toBe(200);

      const json = await response.json();

      expect(json.chartSeries).toHaveLength(1);
      expect(json.chartSeries[0].bucketStart).toBe("2024-06-15T00:00:00.000Z");

      // Should contain both 06:30 and 14:15 data
      const spend = Number.parseFloat(json.chartSeries[0].spend);
      expect(spend).toBeCloseTo(0.015, 5);
      expect(json.chartSeries[0].requests).toBe(2);
    });

    it("from at exact bucket boundary works correctly", async () => {
      // from at midnight should work
      const request = new NextRequest(
        "http://localhost:3000/api/v1/activity?from=2024-06-15T00:00:00Z&to=2024-06-17T00:00:00Z&groupBy=day"
      );

      const response = await GET(request);
      expect(response.status).toBe(200);

      const json = await response.json();

      expect(json.chartSeries).toHaveLength(2);
      expect(json.chartSeries[0].bucketStart).toBe("2024-06-15T00:00:00.000Z");
    });
  });
});
