// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/stack/ai/activity-isolation.stack.test`
 * Purpose: Stack test for Activity feature account isolation (full auth→facade→adapter chain).
 * Scope: Tests end-to-end security invariant: User A cannot see User B data. Does not test pagination or edge cases.
 * Invariants:
 * - inv_account_scope_is_absolute: billingAccountId scoping is enforced from session→response
 * - inv_auth_server_gate: Session resolution works correctly
 * Side-effects: IO (database writes, HTTP requests)
 * Notes: Critical security test - if this fails, data isolation is broken.
 * Links: [ActivityRoute](../../../src/app/api/v1/activity/route.ts), [ActivityFacade](../../../src/app/_facades/ai/activity.server.ts)
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

describe("Activity Account Isolation Stack Tests", () => {
  let userA: {
    userId: string;
    billingAccountId: string;
    virtualKeyId: string;
    session: SessionUser;
  };
  let userB: {
    userId: string;
    billingAccountId: string;
    virtualKeyId: string;
    session: SessionUser;
  };

  beforeAll(async () => {
    if (process.env.APP_ENV !== "test") {
      throw new Error("This test must run in APP_ENV=test");
    }

    const db = getDb();

    // Create User A
    userA = {
      userId: randomUUID(),
      billingAccountId: randomUUID(),
      virtualKeyId: randomUUID(),
      session: {
        id: "",
        walletAddress: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      },
    };
    userA.session.id = userA.userId;

    await db.insert(users).values({
      id: userA.userId,
      name: "User A",
      walletAddress: userA.session.walletAddress,
    });

    await db.insert(billingAccounts).values({
      id: userA.billingAccountId,
      ownerUserId: userA.userId,
      balanceCredits: 1000n,
    });

    await db.insert(virtualKeys).values({
      id: userA.virtualKeyId,
      billingAccountId: userA.billingAccountId,
      litellmVirtualKey: "vk-user-a",
      isDefault: true,
    });

    // Seed User A charge receipts (per ACTIVITY_METRICS.md: no model/tokens - LiteLLM canonical)
    await db.insert(llmUsage).values([
      {
        id: randomUUID(),
        billingAccountId: userA.billingAccountId,
        virtualKeyId: userA.virtualKeyId,
        requestId: "req-a-isolation-1",
        litellmCallId: "call-a-1",
        chargedCredits: 5000n,
        responseCostUsd: "0.005000",
        provenance: "response",
        createdAt: new Date("2024-06-15T10:00:00Z"),
      },
      {
        id: randomUUID(),
        billingAccountId: userA.billingAccountId,
        virtualKeyId: userA.virtualKeyId,
        requestId: "req-a-isolation-2",
        litellmCallId: "call-a-2",
        chargedCredits: 2000n,
        responseCostUsd: "0.002000",
        provenance: "response",
        createdAt: new Date("2024-06-15T11:00:00Z"),
      },
    ]);

    // Create User B
    userB = {
      userId: randomUUID(),
      billingAccountId: randomUUID(),
      virtualKeyId: randomUUID(),
      session: {
        id: "",
        walletAddress: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
      },
    };
    userB.session.id = userB.userId;

    await db.insert(users).values({
      id: userB.userId,
      name: "User B",
      walletAddress: userB.session.walletAddress,
    });

    await db.insert(billingAccounts).values({
      id: userB.billingAccountId,
      ownerUserId: userB.userId,
      balanceCredits: 2000n,
    });

    await db.insert(virtualKeys).values({
      id: userB.virtualKeyId,
      billingAccountId: userB.billingAccountId,
      litellmVirtualKey: "vk-user-b",
      isDefault: true,
    });

    // Seed User B charge receipts (per ACTIVITY_METRICS.md: no model/tokens - LiteLLM canonical)
    await db.insert(llmUsage).values([
      {
        id: randomUUID(),
        billingAccountId: userB.billingAccountId,
        virtualKeyId: userB.virtualKeyId,
        requestId: "req-b-isolation-1",
        litellmCallId: "call-b-1",
        chargedCredits: 100000n,
        responseCostUsd: "0.100000",
        provenance: "response",
        createdAt: new Date("2024-06-15T10:00:00Z"),
      },
      {
        id: randomUUID(),
        billingAccountId: userB.billingAccountId,
        virtualKeyId: userB.virtualKeyId,
        requestId: "req-b-isolation-2",
        litellmCallId: "call-b-2",
        chargedCredits: 50000n,
        responseCostUsd: "0.050000",
        provenance: "response",
        createdAt: new Date("2024-06-15T11:00:00Z"),
      },
      {
        id: randomUUID(),
        billingAccountId: userB.billingAccountId,
        virtualKeyId: userB.virtualKeyId,
        requestId: "req-b-isolation-3",
        litellmCallId: "call-b-3",
        chargedCredits: 10000n,
        responseCostUsd: "0.010000",
        provenance: "stream",
        createdAt: new Date("2024-06-15T12:00:00Z"),
      },
    ]);
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(users).where(eq(users.id, userA.userId));
    await db.delete(users).where(eq(users.id, userB.userId));
  });

  describe("inv_account_scope_is_absolute", () => {
    it("SECURITY CRITICAL: User A session returns ONLY User A data", async () => {
      // Mock auth as User A
      vi.mocked(getServerSessionUser).mockResolvedValue(userA.session);

      const request = new NextRequest(
        "http://localhost:3000/api/v1/activity?from=2024-06-15T00:00:00Z&to=2024-06-16T00:00:00Z&groupBy=day&limit=100"
      );

      const response = await GET(request);
      expect(response.status).toBe(200);

      const json = await response.json();

      // Verify aggregates reflect ONLY User A data
      // User A: 0.005 + 0.002 = 0.007
      const totalSpend = Number.parseFloat(json.totals.spend.total);
      expect(totalSpend).toBeCloseTo(0.007, 5);

      // User A: 2 requests
      expect(json.totals.requests.total).toBe(2);

      // Verify rows exist and are scoped to User A
      // Note: model is "unavailable" in fallback mode per ACTIVITY_METRICS.md (LiteLLM is canonical)
      expect(json.rows.length).toBeGreaterThan(0);

      // Verify request IDs are User A's
      const requestIds = json.rows.map((r: { id: string }) => r.id);
      expect(requestIds).not.toContain("req-b-isolation-1");
      expect(requestIds).not.toContain("req-b-isolation-2");
      expect(requestIds).not.toContain("req-b-isolation-3");
    });

    it("SECURITY CRITICAL: User B session returns ONLY User B data", async () => {
      // Mock auth as User B
      vi.mocked(getServerSessionUser).mockResolvedValue(userB.session);

      const request = new NextRequest(
        "http://localhost:3000/api/v1/activity?from=2024-06-15T00:00:00Z&to=2024-06-16T00:00:00Z&groupBy=day&limit=100"
      );

      const response = await GET(request);
      expect(response.status).toBe(200);

      const json = await response.json();

      // Verify aggregates reflect ONLY User B data
      // User B: 0.1 + 0.05 + 0.01 = 0.16
      const totalSpend = Number.parseFloat(json.totals.spend.total);
      expect(totalSpend).toBeCloseTo(0.16, 5);

      // User B: 3 requests
      expect(json.totals.requests.total).toBe(3);

      // Verify rows exist and are scoped to User B
      // Note: model is "unavailable" in fallback mode per ACTIVITY_METRICS.md (LiteLLM is canonical)
      expect(json.rows.length).toBeGreaterThan(0);

      // Verify request IDs are User B's
      const requestIds = json.rows.map((r: { id: string }) => r.id);
      expect(requestIds).not.toContain("req-a-isolation-1");
      expect(requestIds).not.toContain("req-a-isolation-2");
    });

    it("SECURITY CRITICAL: Same query, different sessions, zero overlap", async () => {
      const queryParams =
        "?from=2024-06-15T00:00:00Z&to=2024-06-16T00:00:00Z&groupBy=day&limit=100";

      // Query as User A
      vi.mocked(getServerSessionUser).mockResolvedValue(userA.session);
      const requestA = new NextRequest(
        `http://localhost:3000/api/v1/activity${queryParams}`
      );
      const responseA = await GET(requestA);
      const jsonA = await responseA.json();

      // Query as User B
      vi.mocked(getServerSessionUser).mockResolvedValue(userB.session);
      const requestB = new NextRequest(
        `http://localhost:3000/api/v1/activity${queryParams}`
      );
      const responseB = await GET(requestB);
      const jsonB = await responseB.json();

      // Verify no overlap in row IDs
      const idsA = new Set(jsonA.rows.map((r: { id: string }) => r.id));
      const idsB = new Set(jsonB.rows.map((r: { id: string }) => r.id));

      for (const id of idsA) {
        expect(idsB.has(id)).toBe(false);
      }

      // Verify aggregates are completely different
      expect(jsonA.totals.spend.total).not.toBe(jsonB.totals.spend.total);
      expect(jsonA.totals.requests.total).not.toBe(jsonB.totals.requests.total);
    });

    it("SECURITY CRITICAL: Cursor from User A cannot leak User B data", async () => {
      // Get User A's first page
      vi.mocked(getServerSessionUser).mockResolvedValue(userA.session);
      const requestA = new NextRequest(
        "http://localhost:3000/api/v1/activity?from=2024-06-15T00:00:00Z&to=2024-06-16T00:00:00Z&groupBy=day&limit=1"
      );
      const responseA = await GET(requestA);
      const jsonA = await responseA.json();

      const cursorA = jsonA.nextCursor;
      expect(cursorA).toBeDefined();

      // Try to use User A's cursor as User B
      vi.mocked(getServerSessionUser).mockResolvedValue(userB.session);
      const requestB = new NextRequest(
        `http://localhost:3000/api/v1/activity?from=2024-06-15T00:00:00Z&to=2024-06-16T00:00:00Z&groupBy=day&limit=1&cursor=${cursorA}`
      );
      const responseB = await GET(requestB);
      const jsonB = await responseB.json();

      // User B's response should still be scoped to User B
      // (cursor only affects ordering, not scoping)
      // Note: model is "unavailable" in fallback mode per ACTIVITY_METRICS.md (LiteLLM is canonical)
      expect(jsonB.rows.length).toBeGreaterThan(0);
      const requestIds = jsonB.rows.map((r: { id: string }) => r.id);
      expect(requestIds).not.toContain("req-a-isolation-1");
      expect(requestIds).not.toContain("req-a-isolation-2");
    });

    it("Chart buckets from User A reflect only User A data", async () => {
      vi.mocked(getServerSessionUser).mockResolvedValue(userA.session);

      const request = new NextRequest(
        "http://localhost:3000/api/v1/activity?from=2024-06-15T00:00:00Z&to=2024-06-16T00:00:00Z&groupBy=day"
      );

      const response = await GET(request);
      expect(response.status).toBe(200);

      const json = await response.json();

      // Chart should show User A's data only
      expect(json.chartSeries).toHaveLength(1);

      const bucket = json.chartSeries[0];
      const bucketSpend = Number.parseFloat(bucket.spend);

      // User A bucket: 0.007
      expect(bucketSpend).toBeCloseTo(0.007, 5);
      expect(bucket.requests).toBe(2);

      // NOT User B's data (0.16)
      expect(bucketSpend).not.toBeCloseTo(0.16, 2);
    });
  });

  describe("Metadata field scoping", () => {
    it("Metadata contains only user-specific app names", async () => {
      vi.mocked(getServerSessionUser).mockResolvedValue(userA.session);

      const request = new NextRequest(
        "http://localhost:3000/api/v1/activity?from=2024-06-15T00:00:00Z&to=2024-06-16T00:00:00Z&groupBy=day&limit=100"
      );

      const response = await GET(request);
      const json = await response.json();

      // User A rows should only have app="app-a"
      const apps = json.rows.map((r: { app?: string }) => r.app);
      expect(apps.every((a: string) => a === "app-a" || a === "Unknown")).toBe(
        true
      );
      expect(apps.includes("app-b")).toBe(false);
    });
  });
});
