// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/integration/db/rls-tenant-isolation.int.test`
 * Purpose: Verify PostgreSQL RLS policies enforce tenant isolation at the database layer.
 * Scope: Tests that SET LOCAL app.current_user_id restricts row visibility per user. Does not test application-layer auth.
 * Invariants:
 * - User A cannot SELECT user B's billing_accounts, virtual_keys, or users row
 * - Missing SET LOCAL (no tenant context) returns zero rows
 * - Service role (BYPASSRLS) can read all rows
 * Side-effects: IO (database operations via testcontainers)
 * Notes: Tests are SKIPPED until RLS migration is applied (docs/DATABASE_RLS_SPEC.md).
 *        All 9 tests confirmed failing for correct reason on 2026-02-03: no RLS policies
 *        exist, so all rows are visible regardless of SET LOCAL / missing context.
 * Links: docs/DATABASE_RLS_SPEC.md, src/adapters/server/db/tenant-scope.ts (future)
 * @public
 */

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/adapters/server/db/client";
import { getDb } from "@/adapters/server/db/client";
import { billingAccounts, users, virtualKeys } from "@/shared/db/schema";

// Remove .skip and run tests once RLS migration (XXXX_enable_rls.sql) is applied.
// RLS migration not yet applied — see docs/DATABASE_RLS_SPEC.md

interface TestTenant {
  userId: string;
  billingAccountId: string;
  virtualKeyId: string;
}

/**
 * Helper: run a callback inside a transaction with app.current_user_id set.
 * This is the pattern that `withTenantScope()` will implement in production code.
 */
async function withTenantScope<T>(
  db: Database,
  userId: string,
  fn: (tx: Parameters<Parameters<Database["transaction"]>[0]>[0]) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    // SET LOCAL does not support parameterized $1 placeholders in PostgreSQL.
    // Use sql.raw() for the value. Safe here because userId is a server-generated UUID,
    // never from user input. Production withTenantScope() must validate format.
    await tx.execute(sql`SET LOCAL app.current_user_id = '${sql.raw(userId)}'`);
    return fn(tx);
  });
}

/**
 * Helper: run a callback inside a transaction WITHOUT setting tenant context.
 * Simulates a forgotten SET LOCAL — should return zero rows under RLS.
 */
async function withoutTenantScope<T>(
  db: Database,
  fn: (tx: Parameters<Parameters<Database["transaction"]>[0]>[0]) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    return fn(tx);
  });
}

describe("RLS Tenant Isolation", () => {
  let db: Database;
  let tenantA: TestTenant;
  let tenantB: TestTenant;

  beforeAll(async () => {
    db = getDb();

    tenantA = {
      userId: randomUUID(),
      billingAccountId: randomUUID(),
      virtualKeyId: randomUUID(),
    };
    tenantB = {
      userId: randomUUID(),
      billingAccountId: randomUUID(),
      virtualKeyId: randomUUID(),
    };

    // Seed tenant A
    await db.insert(users).values({
      id: tenantA.userId,
      name: "Tenant A",
      walletAddress:
        `0x${"a".repeat(40)}${randomUUID().replace(/-/g, "").slice(0, 8)}`.slice(
          0,
          42
        ),
    });
    await db.insert(billingAccounts).values({
      id: tenantA.billingAccountId,
      ownerUserId: tenantA.userId,
      balanceCredits: 1000n,
    });
    await db.insert(virtualKeys).values({
      id: tenantA.virtualKeyId,
      billingAccountId: tenantA.billingAccountId,
      isDefault: true,
    });

    // Seed tenant B
    await db.insert(users).values({
      id: tenantB.userId,
      name: "Tenant B",
      walletAddress:
        `0x${"b".repeat(40)}${randomUUID().replace(/-/g, "").slice(0, 8)}`.slice(
          0,
          42
        ),
    });
    await db.insert(billingAccounts).values({
      id: tenantB.billingAccountId,
      ownerUserId: tenantB.userId,
      balanceCredits: 2000n,
    });
    await db.insert(virtualKeys).values({
      id: tenantB.virtualKeyId,
      billingAccountId: tenantB.billingAccountId,
      isDefault: true,
    });
  });

  afterAll(async () => {
    // Cascade deletes billing_accounts + virtual_keys via FK
    await db
      .delete(users)
      .where(sql`id IN (${tenantA.userId}, ${tenantB.userId})`);
  });

  describe("users table - self-only isolation", () => {
    it.skip("user A can read own users row", async () => {
      const rows = await withTenantScope(db, tenantA.userId, (tx) =>
        tx.select().from(users)
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(tenantA.userId);
    });

    it.skip("user A cannot read user B's users row", async () => {
      const rows = await withTenantScope(db, tenantA.userId, (tx) =>
        tx.select().from(users)
      );
      const ids = rows.map((r) => r.id);
      expect(ids).not.toContain(tenantB.userId);
    });
  });

  describe("billing_accounts - direct FK isolation", () => {
    it.skip("user A sees only own billing account", async () => {
      const rows = await withTenantScope(db, tenantA.userId, (tx) =>
        tx.select().from(billingAccounts)
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.ownerUserId).toBe(tenantA.userId);
    });

    it.skip("user A cannot see user B's billing account", async () => {
      const rows = await withTenantScope(db, tenantA.userId, (tx) =>
        tx.select().from(billingAccounts)
      );
      const ids = rows.map((r) => r.id);
      expect(ids).not.toContain(tenantB.billingAccountId);
    });
  });

  describe("virtual_keys - transitive FK isolation", () => {
    it.skip("user A sees only own virtual keys", async () => {
      const rows = await withTenantScope(db, tenantA.userId, (tx) =>
        tx.select().from(virtualKeys)
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(tenantA.virtualKeyId);
    });

    it.skip("user A cannot see user B's virtual keys", async () => {
      const rows = await withTenantScope(db, tenantA.userId, (tx) =>
        tx.select().from(virtualKeys)
      );
      const ids = rows.map((r) => r.id);
      expect(ids).not.toContain(tenantB.virtualKeyId);
    });
  });

  describe("missing tenant context - fail-safe deny", () => {
    it.skip("no SET LOCAL on billing_accounts returns zero rows", async () => {
      const rows = await withoutTenantScope(db, (tx) =>
        tx.select().from(billingAccounts)
      );
      expect(rows).toHaveLength(0);
    });

    it.skip("no SET LOCAL on users returns zero rows", async () => {
      const rows = await withoutTenantScope(db, (tx) =>
        tx.select().from(users)
      );
      expect(rows).toHaveLength(0);
    });

    it.skip("no SET LOCAL on virtual_keys returns zero rows", async () => {
      const rows = await withoutTenantScope(db, (tx) =>
        tx.select().from(virtualKeys)
      );
      expect(rows).toHaveLength(0);
    });
  });
});
