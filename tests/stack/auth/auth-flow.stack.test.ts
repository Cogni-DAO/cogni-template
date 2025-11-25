// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/stack/auth/auth-flow.stack`
 * Purpose: Verify NextAuth JWT session integration with billing and AI services.
 * Scope: Integration test that mocks getSessionUser to verify session-gated routes. Uses real DB and services. Does not test SIWE signature verification.
 * Invariants: Valid session triggers billing account creation and LLM call; missing session returns 401.
 * Side-effects: IO (database writes via container)
 * Notes: Mocks @/app/_lib/auth/session to simulate JWT session state; verifies session enforcement and billing integration.
 * Links: docs/SECURITY_AUTH_SPEC.md
 * @public
 */

import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

// Mock getSessionUser instead of auth() to avoid NextAuth type complexity
vi.mock("@/app/_lib/auth/session", () => ({
  getSessionUser: vi.fn(),
}));

import { getDb } from "@/adapters/server/db/client";
import { getSessionUser } from "@/app/_lib/auth/session";
import { POST } from "@/app/api/v1/ai/completion/route";
import type { SessionUser } from "@/shared/auth/session";
import { billingAccounts, users, virtualKeys } from "@/shared/db/schema";

describe("Auth Flow Stack Test", () => {
  it("should resolve billing account and call LLM service with valid session", async () => {
    // Arrange
    const mockSessionUser: SessionUser = {
      id: "stack-test-user",
      walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
    };

    // Mock getSessionUser() to return session user
    vi.mocked(getSessionUser).mockResolvedValue(mockSessionUser);

    const body = {
      messages: [{ role: "user", content: "Hello AI" }],
    };

    // Seed user in DB to satisfy FK constraint
    const db = getDb();
    await db.insert(users).values({
      id: mockSessionUser.id,
      name: "Stack Test User",
      walletAddress: mockSessionUser.walletAddress,
    });

    // Seed billing account with credits
    const billingAccountId = "stack-test-billing-id";
    await db.insert(billingAccounts).values({
      id: billingAccountId,
      ownerUserId: mockSessionUser.id,
      balanceCredits: 1000, // Sufficient credits
    });

    // Seed virtual key
    await db.insert(virtualKeys).values({
      billingAccountId,
      litellmVirtualKey: "stack-test-vk",
      isDefault: true,
    });

    const req = new NextRequest("http://localhost:3000/api/v1/ai/completion", {
      method: "POST",
      body: JSON.stringify(body),
    });

    // Act
    const response = await POST(req);

    // Assert
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toHaveProperty("message");
    expect(json.message.role).toBe("assistant");

    // Verify DB side effects
    // 1. Billing Account should exist (seeded above)
    const billingAccount = await db.query.billingAccounts.findFirst({
      where: eq(billingAccounts.ownerUserId, mockSessionUser.id),
    });
    expect(billingAccount).toBeDefined();
    expect(billingAccount?.balanceCredits).toBeDefined();

    // 2. Virtual Key should exist (seeded above)
    if (billingAccount) {
      const virtualKey = await db.query.virtualKeys.findFirst({
        where: eq(virtualKeys.billingAccountId, billingAccount.id),
      });
      expect(virtualKey).toBeDefined();
    }
  });

  it("should return 401 when no session is present", async () => {
    // Arrange
    vi.mocked(getSessionUser).mockResolvedValue(null);

    const body = {
      messages: [{ role: "user", content: "Hello AI" }],
    };

    const req = new NextRequest("http://localhost:3000/api/v1/ai/completion", {
      method: "POST",
      body: JSON.stringify(body),
    });

    // Act
    const response = await POST(req);

    // Assert
    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json).toEqual({ error: "Session required" });
  });
});
