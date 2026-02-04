// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/integration/db/rls-tenant-isolation.int.test`
 * Purpose: Verify PostgreSQL RLS policies enforce tenant isolation at the database layer.
 * Scope: Tests that SET LOCAL app.current_user_id restricts row visibility per user. Does not test application-layer auth.
 * Invariants:
 * - User A cannot SELECT user B's billing_accounts, virtual_keys, or users row
 * - Missing SET LOCAL (no tenant context) returns zero rows
 * Side-effects: IO (database operations via testcontainers)
 * Notes: getDb() connects as app_user (FORCE RLS via provision.sh). getSeedDb()
 *        connects as app_user_service (BYPASSRLS) for seed/cleanup.
 * Links: docs/DATABASE_RLS_SPEC.md, src/adapters/server/db/tenant-scope.ts
 * @public
 */

import { randomUUID } from "node:crypto";
import { toUserId, userActor } from "@cogni/ids";
import { getSeedDb } from "@tests/_fixtures/db/seed-client";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/adapters/server/db/client";
import {
  getDb,
  withTenantScope as productionWithTenantScope,
  setTenantContext,
} from "@/adapters/server/db/client";
import { billingAccounts, users, virtualKeys } from "@/shared/db/schema";

interface TestTenant {
  userId: string;
  billingAccountId: string;
  virtualKeyId: string;
}

/**
 * Helper: run a callback inside a transaction with RLS active.
 * app_user already has FORCE RLS via provision.sh — only tenant context needed.
 */
async function withTenantScope<T>(
  db: Database,
  userId: string,
  fn: (tx: Parameters<Parameters<Database["transaction"]>[0]>[0]) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL app.current_user_id = '${sql.raw(userId)}'`);
    return fn(tx);
  });
}

/**
 * Helper: run a callback as app_user WITHOUT setting tenant context.
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
    // app_user (FORCE RLS) for assertion queries; getSeedDb (BYPASSRLS) for seed/cleanup
    db = getDb();
    const seedDb = getSeedDb();

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

    // Seed via service role (bypasses RLS)
    await seedDb.insert(users).values({
      id: tenantA.userId,
      name: "Tenant A",
      walletAddress:
        `0x${"a".repeat(40)}${randomUUID().replace(/-/g, "").slice(0, 8)}`.slice(
          0,
          42
        ),
    });
    await seedDb.insert(billingAccounts).values({
      id: tenantA.billingAccountId,
      ownerUserId: tenantA.userId,
      balanceCredits: 1000n,
    });
    await seedDb.insert(virtualKeys).values({
      id: tenantA.virtualKeyId,
      billingAccountId: tenantA.billingAccountId,
      isDefault: true,
    });

    await seedDb.insert(users).values({
      id: tenantB.userId,
      name: "Tenant B",
      walletAddress:
        `0x${"b".repeat(40)}${randomUUID().replace(/-/g, "").slice(0, 8)}`.slice(
          0,
          42
        ),
    });
    await seedDb.insert(billingAccounts).values({
      id: tenantB.billingAccountId,
      ownerUserId: tenantB.userId,
      balanceCredits: 2000n,
    });
    await seedDb.insert(virtualKeys).values({
      id: tenantB.virtualKeyId,
      billingAccountId: tenantB.billingAccountId,
      isDefault: true,
    });
  });

  afterAll(async () => {
    // Cleanup via service role (bypasses RLS)
    await getSeedDb()
      .delete(users)
      .where(sql`id IN (${tenantA.userId}, ${tenantB.userId})`);
  });

  describe("users table - self-only isolation", () => {
    it("user A can read own users row", async () => {
      const rows = await withTenantScope(db, tenantA.userId, (tx) =>
        tx.select().from(users)
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(tenantA.userId);
    });

    it("user A cannot read user B's users row", async () => {
      const rows = await withTenantScope(db, tenantA.userId, (tx) =>
        tx.select().from(users)
      );
      const ids = rows.map((r) => r.id);
      expect(ids).not.toContain(tenantB.userId);
    });
  });

  describe("billing_accounts - direct FK isolation", () => {
    it("user A sees only own billing account", async () => {
      const rows = await withTenantScope(db, tenantA.userId, (tx) =>
        tx.select().from(billingAccounts)
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.ownerUserId).toBe(tenantA.userId);
    });

    it("user A cannot see user B's billing account", async () => {
      const rows = await withTenantScope(db, tenantA.userId, (tx) =>
        tx.select().from(billingAccounts)
      );
      const ids = rows.map((r) => r.id);
      expect(ids).not.toContain(tenantB.billingAccountId);
    });
  });

  describe("virtual_keys - transitive FK isolation", () => {
    it("user A sees only own virtual keys", async () => {
      const rows = await withTenantScope(db, tenantA.userId, (tx) =>
        tx.select().from(virtualKeys)
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(tenantA.virtualKeyId);
    });

    it("user A cannot see user B's virtual keys", async () => {
      const rows = await withTenantScope(db, tenantA.userId, (tx) =>
        tx.select().from(virtualKeys)
      );
      const ids = rows.map((r) => r.id);
      expect(ids).not.toContain(tenantB.virtualKeyId);
    });
  });

  describe("missing tenant context - fail-safe deny", () => {
    it("no SET LOCAL on billing_accounts returns zero rows", async () => {
      const rows = await withoutTenantScope(db, (tx) =>
        tx.select().from(billingAccounts)
      );
      expect(rows).toHaveLength(0);
    });

    it("no SET LOCAL on users returns zero rows", async () => {
      const rows = await withoutTenantScope(db, (tx) =>
        tx.select().from(users)
      );
      expect(rows).toHaveLength(0);
    });

    it("no SET LOCAL on virtual_keys returns zero rows", async () => {
      const rows = await withoutTenantScope(db, (tx) =>
        tx.select().from(virtualKeys)
      );
      expect(rows).toHaveLength(0);
    });
  });

  describe("write-path WITH CHECK enforcement", () => {
    it("cross-tenant INSERT is rejected by RLS policy", async () => {
      let caught: unknown;
      try {
        await withTenantScope(db, tenantA.userId, (tx) =>
          tx.insert(billingAccounts).values({
            id: randomUUID(),
            ownerUserId: tenantB.userId, // User A trying to write as User B
            balanceCredits: 0n,
          })
        );
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeDefined();
      // Drizzle wraps postgres.js errors: err.cause has the PG error with code + message
      const cause = (caught as { cause?: { code?: string } }).cause;
      expect(cause?.code).toBe("42501"); // insufficient_privilege (RLS WITH CHECK)
    });
  });

  describe("production tenant-scope helpers", () => {
    it("toUserId rejects non-UUID string before SQL", () => {
      expect(() => toUserId("not-a-uuid")).toThrow("Invalid UserId");
    });

    it("withTenantScope sets current_setting correctly", async () => {
      const validId = randomUUID();
      const actorId = userActor(toUserId(validId));
      const result = await productionWithTenantScope(
        db,
        actorId,
        async (tx) => {
          const rows = await tx.execute(
            sql`SELECT current_setting('app.current_user_id') AS uid`
          );
          return rows[0] as { uid: string };
        }
      );
      expect(result.uid).toBe(validId);
    });

    it("setTenantContext sets current_setting in existing transaction", async () => {
      const validId = randomUUID();
      const actorId = userActor(toUserId(validId));
      const result = await db.transaction(async (tx) => {
        await setTenantContext(tx, actorId);
        const rows = await tx.execute(
          sql`SELECT current_setting('app.current_user_id') AS uid`
        );
        return rows[0] as { uid: string };
      });
      expect(result.uid).toBe(validId);
    });
  });

  describe("service role BYPASSRLS", () => {
    it("service role sees all tenants' data without tenant context", async () => {
      // getSeedDb() connects as app_user_service (BYPASSRLS) — no tenant context needed
      const rows = await getSeedDb().select().from(billingAccounts);
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(tenantA.billingAccountId);
      expect(ids).toContain(tenantB.billingAccountId);
    });
  });
});
