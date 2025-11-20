// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/db/drizzle`
 * Purpose: Verifies Drizzle database client integration and operations under real PostgreSQL conditions.
 * Scope: Covers database operations, migrations, and connection handling. Does NOT test PostgreSQL server itself.
 * Invariants: Real database integration works; operations handle errors; accounts table CRUD works correctly.
 * Side-effects: IO
 * Notes: Tests against real Postgres; uses accounts schema; cleanup after tests.
 * Links: src/adapters/server/db/
 * @public
 */

import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { getDb } from "@/adapters/server/db/drizzle.client";
import { accounts } from "@/shared/db";

/**
 * Integration tests for Drizzle database client.
 *
 * Tests database operations against real Postgres instance.
 * Requires running Postgres database (use pnpm dev:infra to start).
 */

describe("Drizzle Client Integration", () => {
  // Clean up test data after each test
  afterEach(async () => {
    const db = getDb();
    await db.delete(accounts).where(eq(accounts.id, "test-account-123"));
    await db.delete(accounts).where(eq(accounts.id, "test-account-456"));
  });

  describe("Database Connection", () => {
    it("should connect to database successfully", async () => {
      // Simple query to verify connection - select from accounts table
      const db = getDb();
      const result = await db.select().from(accounts).limit(0);
      expect(result).toBeInstanceOf(Array);
      expect(result).toHaveLength(0);
    });
  });

  describe("Accounts Table CRUD Operations", () => {
    it("should insert new account with default balance", async () => {
      const testAccount = {
        id: "test-account-123",
        displayName: "Test Account",
      };

      const db = getDb();
      const inserted = await db
        .insert(accounts)
        .values(testAccount)
        .returning();

      expect(inserted).toHaveLength(1);
      expect(inserted[0]?.id).toBe(testAccount.id);
      expect(inserted[0]?.displayName).toBe(testAccount.displayName);
      expect(inserted[0]?.balanceCredits).toBe("0.00");
      expect(inserted[0]?.createdAt).toBeInstanceOf(Date);
    });

    it("should insert account with custom balance", async () => {
      const testAccount = {
        id: "test-account-456",
        displayName: "Test Account with Balance",
        balanceCredits: "100.50",
      };

      const db = getDb();
      const inserted = await db
        .insert(accounts)
        .values(testAccount)
        .returning();

      expect(inserted[0]?.balanceCredits).toBe("100.50");
    });

    it("should select account by id", async () => {
      // Insert test data
      const db = getDb();
      await db.insert(accounts).values({
        id: "test-account-123",
        displayName: "Test Account",
        balanceCredits: "75.25",
      });

      // Query by id
      const found = await db
        .select()
        .from(accounts)
        .where(eq(accounts.id, "test-account-123"));

      expect(found).toHaveLength(1);
      expect(found[0]?.id).toBe("test-account-123");
      expect(found[0]?.balanceCredits).toBe("75.25");
    });

    it("should update account balance", async () => {
      // Insert test data
      const db = getDb();
      await db.insert(accounts).values({
        id: "test-account-123",
        displayName: "Test Account",
        balanceCredits: "50.00",
      });

      // Update balance
      const updated = await db
        .update(accounts)
        .set({ balanceCredits: "25.75" })
        .where(eq(accounts.id, "test-account-123"))
        .returning();

      expect(updated[0]?.balanceCredits).toBe("25.75");
    });

    it("should delete account", async () => {
      // Insert test data
      const db = getDb();
      await db.insert(accounts).values({
        id: "test-account-123",
        displayName: "Test Account",
      });

      // Delete account
      const deleted = await db
        .delete(accounts)
        .where(eq(accounts.id, "test-account-123"))
        .returning();

      expect(deleted).toHaveLength(1);
      expect(deleted[0]?.id).toBe("test-account-123");

      // Verify deletion
      const found = await db
        .select()
        .from(accounts)
        .where(eq(accounts.id, "test-account-123"));
      expect(found).toHaveLength(0);
    });
  });

  describe("Data Types and Constraints", () => {
    it("should handle decimal precision correctly", async () => {
      const testAccount = {
        id: "test-account-123",
        balanceCredits: "999999.99", // Max precision test
      };

      const db = getDb();
      const inserted = await db
        .insert(accounts)
        .values(testAccount)
        .returning();
      expect(inserted[0]?.balanceCredits).toBe("999999.99");
    });

    it("should prevent duplicate primary keys", async () => {
      // Insert first account
      const db = getDb();
      await db.insert(accounts).values({
        id: "test-account-123",
        displayName: "First Account",
      });

      // Attempt to insert duplicate ID should fail
      await expect(
        db.insert(accounts).values({
          id: "test-account-123", // Duplicate ID should fail
          displayName: "Duplicate Account",
        })
      ).rejects.toThrow();
    });

    it("should enforce not null constraint on balance", async () => {
      const db = getDb();
      await expect(
        // @ts-expect-error Testing invalid null value for required field
        db.insert(accounts).values({
          id: "test-account-123",
          balanceCredits: null,
        })
      ).rejects.toThrow();
    });
  });
});
