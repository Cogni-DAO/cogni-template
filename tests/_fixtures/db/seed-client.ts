// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/_fixtures/db/seed-client`
 * Purpose: Service-role database client for test fixture seeding and cleanup.
 * Scope: Provides getSeedDb() — a lazy singleton using DATABASE_SERVICE_URL (BYPASSRLS).
 *   Test code MUST use this for INSERT/DELETE operations, never getDb() (which is RLS-enforced).
 *   getDb() should only be used for adapter construction and assertion queries under RLS.
 * Invariants: Requires DATABASE_SERVICE_URL in env (set by testcontainers global setup)
 * Side-effects: IO (database connection) — only on first access
 * Links: tests/integration/setup/testcontainers-postgres.global.ts
 * @internal
 */

import type { Database } from "@cogni/db-client";
import { createServiceDbClient } from "@cogni/db-client/service";

let _seedDb: Database | null = null;

/**
 * Returns a service-role database client (BYPASSRLS) for test fixture
 * seeding and cleanup. Connects via DATABASE_SERVICE_URL.
 */
export function getSeedDb(): Database {
  if (!_seedDb) {
    const url = process.env.DATABASE_SERVICE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_SERVICE_URL not set. Run tests via vitest integration config (pnpm test:int)."
      );
    }
    _seedDb = createServiceDbClient(url);
  }
  return _seedDb;
}
