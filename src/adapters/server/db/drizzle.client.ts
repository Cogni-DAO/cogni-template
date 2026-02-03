// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/db/drizzle.client`
 * Purpose: Lazy database singleton for the Next.js web runtime.
 * Scope: Wraps createAppDbClient with env-derived connection string. Does not handle business logic or migrations.
 * Invariants: Single database connection instance; lazy initialization prevents build-time env access
 * Side-effects: IO (database connections) - only on first access
 * Notes: Database type is re-exported from @cogni/db-client so all consumers share one type.
 * Links: docs/DATABASE_RLS_SPEC.md
 * @internal
 */

import {
  createAppDbClient,
  createServiceDbClient,
  type Database,
} from "@cogni/db-client";

import { serverEnv } from "@/shared/env";

export type { Database };

// Lazy database connection - only created when first accessed
let _db: Database | null = null;

function createDb(): Database {
  if (!_db) {
    _db = createAppDbClient(serverEnv().DATABASE_URL);
  }
  return _db;
}

// Lazy service-role connection (BYPASSRLS) for pre-auth lookups and worker paths.
// Falls back to DATABASE_URL when DATABASE_SERVICE_URL is not configured (local dev).
let _serviceDb: Database | null = null;

function createServiceDb(): Database {
  if (!_serviceDb) {
    const env = serverEnv();
    _serviceDb = createServiceDbClient(
      env.DATABASE_SERVICE_URL ?? env.DATABASE_URL
    );
  }
  return _serviceDb;
}

// Export lazy database getters to avoid top-level runtime env access
export const getDb = createDb;
export const getServiceDb = createServiceDb;
