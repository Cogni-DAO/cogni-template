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
 * Notes: Tests connect as postgres superuser (testcontainers default). We use
 *        `SET LOCAL ROLE app_user` inside transactions to simulate the non-superuser
 *        app connection, since superusers bypass RLS even with FORCE.
 *        The app_user role is created in beforeAll (testcontainers has no provision.sh).
 * Links: docs/DATABASE_RLS_SPEC.md, src/adapters/server/db/tenant-scope.ts
 * @public
 */

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/adapters/server/db/client";
import {
  getDb,
  withTenantScope as productionWithTenantScope,
  setTenantContext,
  toUserId,
  userActor,
} from "@/adapters/server/db/client";
import { billingAccounts, users, virtualKeys } from "@/shared/db/schema";

// Role names matching provision.sh convention
const APP_USER_ROLE = "app_user_test";
const APP_SERVICE_ROLE = "app_user_service_test";

interface TestTenant {
  userId: string;
  billingAccountId: string;
  virtualKeyId: string;
}

/**
 * Helper: run a callback inside a transaction with RLS active.
 * 1. SET LOCAL ROLE to a non-superuser (so RLS is enforced)
 * 2. SET LOCAL app.current_user_id for tenant scoping
 */
async function withTenantScope<T>(
  db: Database,
  userId: string,
  fn: (tx: Parameters<Parameters<Database["transaction"]>[0]>[0]) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL ROLE "${APP_USER_ROLE}"`));
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
    await tx.execute(sql.raw(`SET LOCAL ROLE "${APP_USER_ROLE}"`));
    return fn(tx);
  });
}

describe("RLS Tenant Isolation", () => {
  let db: Database;
  let tenantA: TestTenant;
  let tenantB: TestTenant;

  beforeAll(async () => {
    db = getDb();

    // Create a non-superuser role for RLS testing (idempotent).
    // Superusers bypass RLS even with FORCE; SET LOCAL ROLE simulates app connection.
    await db.execute(
      sql.raw(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_USER_ROLE}') THEN
          CREATE ROLE "${APP_USER_ROLE}" NOLOGIN;
        END IF;
      END
      $$;
    `)
    );
    await db.execute(
      sql.raw(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${APP_USER_ROLE}"`
      )
    );

    // Create a BYPASSRLS role for service bypass testing (idempotent).
    await db.execute(
      sql.raw(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_SERVICE_ROLE}') THEN
          CREATE ROLE "${APP_SERVICE_ROLE}" NOLOGIN BYPASSRLS;
        END IF;
      END
      $$;
    `)
    );
    await db.execute(
      sql.raw(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${APP_SERVICE_ROLE}"`
      )
    );

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

    // Seed as superuser (bypasses RLS for data setup)
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
    // Cleanup as superuser (bypasses RLS)
    await db
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
      const rows = await db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL ROLE "${APP_SERVICE_ROLE}"`));
        // Deliberately NOT setting app.current_user_id
        return tx.select().from(billingAccounts);
      });
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(tenantA.billingAccountId);
      expect(ids).toContain(tenantB.billingAccountId);
    });
  });
});
