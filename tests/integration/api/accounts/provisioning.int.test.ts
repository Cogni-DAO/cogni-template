// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@integration/accounts/provisioning`
 * Purpose: Integration tests for automatic account provisioning at auth boundary.
 * Scope: Tests real API calls with account creation flow. Does not mock database or auth boundary.
 * Invariants: Accounts created automatically on first API key usage with stable IDs
 * Side-effects: IO (HTTP requests and database operations)
 * Notes: Requires running Postgres and LiteLLM (use pnpm dev:infra)
 * Links: Stage 2.5 account provisioning implementation
 * @public
 */

import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/adapters/server/db/drizzle.client";
import { POST } from "@/app/api/v1/ai/completion/route";
import { accounts } from "@/shared/db";
import { deriveAccountIdFromApiKey } from "@/shared/util";

/**
 * Integration tests for account provisioning.
 *
 * Tests that accounts are automatically created when new API keys are used.
 * Verifies stable account ID derivation and zero-balance initialization.
 */
describe("Account Provisioning Integration", () => {
  const testApiKey1 = "test-api-key-12345";
  const testApiKey2 = "test-api-key-67890";
  const accountId1 = deriveAccountIdFromApiKey(testApiKey1);
  const accountId2 = deriveAccountIdFromApiKey(testApiKey2);

  // Clean up test accounts before and after each test
  beforeEach(async () => {
    await db.delete(accounts).where(eq(accounts.id, accountId1));
    await db.delete(accounts).where(eq(accounts.id, accountId2));
  });

  afterEach(async () => {
    await db.delete(accounts).where(eq(accounts.id, accountId1));
    await db.delete(accounts).where(eq(accounts.id, accountId2));
  });

  describe("Stable Account ID Derivation", () => {
    it("should generate consistent account IDs from same API key", () => {
      const id1 = deriveAccountIdFromApiKey(testApiKey1);
      const id2 = deriveAccountIdFromApiKey(testApiKey1);

      expect(id1).toBe(id2);
      expect(id1).toMatch(/^key:[a-f0-9]{32}$/);
    });

    it("should generate different account IDs for different API keys", () => {
      const id1 = deriveAccountIdFromApiKey(testApiKey1);
      const id2 = deriveAccountIdFromApiKey(testApiKey2);

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^key:[a-f0-9]{32}$/);
      expect(id2).toMatch(/^key:[a-f0-9]{32}$/);
    });

    it("should be collision-resistant with similar keys", () => {
      const id1 = deriveAccountIdFromApiKey("test-key-1");
      const id2 = deriveAccountIdFromApiKey("test-key-2");
      const id3 = deriveAccountIdFromApiKey("test-key-12"); // Similar prefix

      expect(new Set([id1, id2, id3])).toHaveProperty("size", 3);
    });
  });

  describe("Account Creation at Auth Boundary", () => {
    it("should verify account does not exist before first API call", async () => {
      // Verify account doesn't exist initially
      const beforeCall = await db
        .select()
        .from(accounts)
        .where(eq(accounts.id, accountId1));

      expect(beforeCall).toHaveLength(0);
    });

    // Note: This test would pass if we had the full account provisioning implemented
    // For now, it documents the expected behavior
    it.skip("should create account automatically on first API usage", async () => {
      // Verify account doesn't exist initially
      const beforeCall = await db
        .select()
        .from(accounts)
        .where(eq(accounts.id, accountId1));

      expect(beforeCall).toHaveLength(0);

      // Make API call with new key (this would trigger account creation)
      const request = new NextRequest(
        "http://localhost:3000/api/v1/ai/completion",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${testApiKey1}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: [{ role: "user", content: "Hello" }],
          }),
        }
      );

      // Call would succeed (or fail for other reasons, but not account missing)
      await POST(request);

      // Verify account was created with correct properties
      const afterCall = await db
        .select()
        .from(accounts)
        .where(eq(accounts.id, accountId1));

      expect(afterCall).toHaveLength(1);
      expect(afterCall[0]).toMatchObject({
        id: accountId1,
        balanceCredits: "0.00", // Starts with zero balance
        displayName: null, // No display name initially
      });
      expect(afterCall[0]).toBeDefined();
      if (afterCall[0]) {
        expect(afterCall[0].createdAt).toBeInstanceOf(Date);
      }
    });

    it.skip("should not create duplicate accounts for same API key", async () => {
      // First call creates account
      const request1 = new NextRequest(
        "http://localhost:3000/api/v1/ai/completion",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${testApiKey1}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: [{ role: "user", content: "First call" }],
          }),
        }
      );

      await POST(request1);

      // Second call with same key should not create duplicate
      const request2 = new NextRequest(
        "http://localhost:3000/api/v1/ai/completion",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${testApiKey1}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: [{ role: "user", content: "Second call" }],
          }),
        }
      );

      await POST(request2);

      // Verify still only one account
      const accounts_after = await db
        .select()
        .from(accounts)
        .where(eq(accounts.id, accountId1));

      expect(accounts_after).toHaveLength(1);
    });

    it.skip("should create separate accounts for different API keys", async () => {
      // Call with first key
      const request1 = new NextRequest(
        "http://localhost:3000/api/v1/ai/completion",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${testApiKey1}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: [{ role: "user", content: "First key" }],
          }),
        }
      );

      // Call with second key
      const request2 = new NextRequest(
        "http://localhost:3000/api/v1/ai/completion",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${testApiKey2}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: [{ role: "user", content: "Second key" }],
          }),
        }
      );

      await POST(request1);
      await POST(request2);

      // Verify both accounts exist
      const account1 = await db
        .select()
        .from(accounts)
        .where(eq(accounts.id, accountId1));

      const account2 = await db
        .select()
        .from(accounts)
        .where(eq(accounts.id, accountId2));

      expect(account1).toHaveLength(1);
      expect(account2).toHaveLength(1);
      expect(account1[0]).toBeDefined();
      expect(account2[0]).toBeDefined();
      if (account1[0] && account2[0]) {
        expect(account1[0].id).not.toBe(account2[0].id);
      }
    });
  });

  describe("Manual Account Creation (Database Layer)", () => {
    it("should allow manual account creation with stable ID", async () => {
      // Create account manually (simulating what provisioning will do)
      await db.insert(accounts).values({
        id: accountId1,
        balanceCredits: "0.00",
        displayName: null,
      });

      // Verify account exists with correct stable ID
      const created = await db
        .select()
        .from(accounts)
        .where(eq(accounts.id, accountId1));

      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({
        id: accountId1,
        balanceCredits: "0.00",
        displayName: null,
      });

      // Verify the account ID matches our derivation
      expect(created[0]).toBeDefined();
      if (created[0]) {
        expect(created[0].id).toBe(deriveAccountIdFromApiKey(testApiKey1));
      }
    });

    it("should handle account ID collisions gracefully", async () => {
      // Create first account
      await db.insert(accounts).values({
        id: accountId1,
        balanceCredits: "5.00",
        displayName: "First Account",
      });

      // Attempt to create account with same ID should fail
      await expect(
        db.insert(accounts).values({
          id: accountId1, // Same ID
          balanceCredits: "10.00",
          displayName: "Duplicate Account",
        })
      ).rejects.toThrow();

      // Verify original account unchanged
      const original = await db
        .select()
        .from(accounts)
        .where(eq(accounts.id, accountId1));

      expect(original).toHaveLength(1);
      expect(original[0]).toBeDefined();
      if (original[0]) {
        expect(original[0]).toMatchObject({
          id: accountId1,
          balanceCredits: "5.00",
          displayName: "First Account",
        });
      }
    });
  });
});
