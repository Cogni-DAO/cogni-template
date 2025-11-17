// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/db/drizzle.client`
 * Purpose: Drizzle database client configuration and connection management.
 * Scope: Database connection setup and Drizzle ORM instance. Does not handle business logic or migrations.
 * Invariants: Single database connection instance; properly configured with schema
 * Side-effects: IO (database connections)
 * Notes: Uses postgres driver with Drizzle ORM; connection string from environment
 * Links: Used by database adapters for queries
 * @internal
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/shared/db";
import { serverEnv } from "@/shared/env";

// Create postgres client
const client = postgres(serverEnv.DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

// Create Drizzle instance with schema
export const db = drizzle(client, { schema });

// Type for the database instance
export type Database = typeof db;
