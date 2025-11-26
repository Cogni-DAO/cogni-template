// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/db/drizzle.client`
 * Purpose: Drizzle database client configuration and connection management.
 * Scope: Database connection setup and Drizzle ORM instance. Does not handle business logic or migrations.
 * Invariants: Single database connection instance; properly configured with schema; lazy initialization
 * Side-effects: IO (database connections) - only on first access
 * Notes: Uses postgres driver with Drizzle ORM; connection string from runtime environment; lazy loading prevents build-time env access
 * Links: Used by database adapters for queries
 * @internal
 */

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/shared/db";
import { serverEnv } from "@/shared/env";

// Schema-aware database type
export type Database = PostgresJsDatabase<typeof schema>;

// Lazy database connection - only created when first accessed
let _db: Database | null = null;

function createDb(): Database {
  if (!_db) {
    const env = serverEnv();
    const client = postgres(env.DATABASE_URL, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      connection: {
        application_name: "cogni_template_app",
      },
    });
    _db = drizzle(client, { schema });
  }
  return _db;
}

// Export lazy database getter to avoid top-level runtime env access
export const getDb = createDb;
