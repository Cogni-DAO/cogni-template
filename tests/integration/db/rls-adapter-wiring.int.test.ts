// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/integration/db/rls-adapter-wiring.int.test`
 * Purpose: Gate tests that FAIL until adapters internally call setTenantContext under RLS.
 * Scope: Calls real adapter methods through an RLS-enforced connection with no external withTenantScope wrapper. Does not test cross-tenant isolation (see rls-tenant-isolation.int.test.ts).
 * Invariants:
 * - Tests FAIL today because adapters don't call setTenantContext yet
 * - Tests PASS once each adapter is wired — that's the gate
 * - Adapters must scope themselves; the caller does NOT wrap in withTenantScope
 * Side-effects: IO (database operations via testcontainers)
 * Notes: Uses production app_user role (FORCE RLS via provision.sh) for rlsDb.
 *        getSeedDb() (app_user_service, BYPASSRLS) handles seed/cleanup.
 * Links: docs/DATABASE_RLS_SPEC.md (Adapter Wiring Tracker), rls-tenant-isolation.int.test.ts
 * @public
 */

import { randomUUID } from "node:crypto";
import { type Database, DrizzleScheduleUserAdapter } from "@cogni/db-client";
import {
  billingAccounts,
  executionGrants,
  schedules,
  users,
  virtualKeys,
} from "@cogni/db-schema";
import { generateTestWallet } from "@tests/_fixtures/auth/db-helpers";
import { getSeedDb } from "@tests/_fixtures/db/seed-client";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DrizzleAccountService } from "@/adapters/server/accounts/drizzle.adapter";
import { getDb } from "@/adapters/server/db/client";

interface TestTenant {
  userId: string;
  billingAccountId: string;
  executionGrantId: string;
  scheduleId: string;
}

describe("RLS Adapter Wiring Gate", () => {
  let superDb: Database;
  let rlsDb: Database;
  let tenantA: TestTenant;

  beforeAll(async () => {
    // superDb uses service role (BYPASSRLS) for seed/cleanup
    superDb = getSeedDb();
    // rlsDb uses app_user role (FORCE RLS) — production roles from provision.sh
    rlsDb = getDb();

    // Seed tenant data as superuser (bypasses RLS)
    tenantA = {
      userId: randomUUID(),
      billingAccountId: randomUUID(),
      executionGrantId: randomUUID(),
      scheduleId: randomUUID(),
    };

    await superDb.insert(users).values({
      id: tenantA.userId,
      name: "RLS Wiring Gate User",
      walletAddress: generateTestWallet("rls-gate"),
    });

    await superDb.insert(billingAccounts).values({
      id: tenantA.billingAccountId,
      ownerUserId: tenantA.userId,
      balanceCredits: 100_000_000n,
    });

    await superDb.insert(virtualKeys).values({
      billingAccountId: tenantA.billingAccountId,
      label: "RLS Gate Default",
      isDefault: true,
      active: true,
    });

    await superDb.insert(executionGrants).values({
      id: tenantA.executionGrantId,
      userId: tenantA.userId,
      billingAccountId: tenantA.billingAccountId,
      scopes: ["graph:execute:test:rls-gate"],
    });

    await superDb.insert(schedules).values({
      id: tenantA.scheduleId,
      ownerUserId: tenantA.userId,
      executionGrantId: tenantA.executionGrantId,
      graphId: "test:rls-gate",
      input: { test: true },
      cron: "0 0 * * *",
      timezone: "UTC",
      enabled: true,
      nextRunAt: new Date(Date.now() + 86_400_000),
    });
  });

  afterAll(async () => {
    // CASCADE from users handles child rows
    await superDb.delete(users).where(eq(users.id, tenantA.userId));
  });

  // ── Sanity: prove seeded data exists via superuser ────────────

  describe("sanity: data visible via superuser", () => {
    it("superuser reads the seeded schedule", async () => {
      const rows = await superDb.query.schedules.findMany({
        where: eq(schedules.id, tenantA.scheduleId),
      });
      expect(rows).toHaveLength(1);
    });

    it("superuser reads the seeded billing account", async () => {
      const rows = await superDb.query.billingAccounts.findMany({
        where: eq(billingAccounts.id, tenantA.billingAccountId),
      });
      expect(rows).toHaveLength(1);
    });
  });

  // ── Wiring gates ──────────────────────────────────────────────
  //
  // These tests call adapter methods directly — NO withTenantScope wrapper.
  // The adapter must internally call setTenantContext to pass.
  //
  // Today: adapters don't scope → RLS blocks → tests FAIL.
  // After wiring: adapters scope themselves → tests PASS.

  describe("DrizzleScheduleUserAdapter", () => {
    let adapter: DrizzleScheduleUserAdapter;

    beforeAll(() => {
      // listSchedules only uses this.db — stubs are never called
      // biome-ignore lint/suspicious/noExplicitAny: test stubs for unused ports
      adapter = new DrizzleScheduleUserAdapter(rlsDb, {} as any, {} as any);
    });

    // TODO(rls): unskip when adapters call withTenantScope (Commit 2)
    it.skip("listSchedules returns schedules for the calling user", async () => {
      const result = await adapter.listSchedules(tenantA.userId);
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0]?.ownerUserId).toBe(tenantA.userId);
    });
  });

  describe("DrizzleAccountService", () => {
    let service: DrizzleAccountService;

    beforeAll(() => {
      service = new DrizzleAccountService(rlsDb);
    });

    // TODO(rls): unskip when adapters call withTenantScope (Commit 3)
    it.skip("getOrCreateBillingAccountForUser returns account for existing user", async () => {
      const result = await service.getOrCreateBillingAccountForUser({
        userId: tenantA.userId,
      });
      expect(result.ownerUserId).toBe(tenantA.userId);
    });
  });
});
