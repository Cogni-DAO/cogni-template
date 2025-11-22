// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/stack/setup/reset-db`
 * Purpose: Vitest global setup for stack tests to reset test database tables between runs.
 * Scope: Truncates all tables in stack test database to ensure clean state. Does not handle migrations.
 * Invariants: Only operates on stack test database; preserves schema structure; cleans all data.
 * Side-effects: IO (database truncation)
 * Notes: Assumes app has already run migrations; used by vitest.stack.config.mts as globalSetup.
 * Links: vitest stack config, database schema
 * @internal
 */

import postgres from "postgres";

import { buildDatabaseUrl } from "@/shared/db/db-url";

export default async function resetStackTestDatabase() {
  console.log("🧹 Resetting stack test database...");

  // Build DATABASE_URL from environment pieces (consistent with app behavior)
  const dbEnv: Record<string, string | number | undefined> = {
    POSTGRES_USER: process.env.POSTGRES_USER,
    POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD,
    POSTGRES_DB: process.env.POSTGRES_DB,
    DB_HOST: process.env.DB_HOST,
    DB_PORT: process.env.DB_PORT,
  };

  // Filter out undefined values to satisfy exactOptionalPropertyTypes
  const filteredEnv = Object.fromEntries(
    Object.entries(dbEnv).filter(([, value]) => value !== undefined)
  );

  const databaseUrl = process.env.DATABASE_URL ?? buildDatabaseUrl(filteredEnv);

  const sql = postgres(databaseUrl, {
    max: 1, // Use only one connection for setup
    connection: {
      application_name: "vitest_stack_reset",
    },
  });

  try {
    // Wipe tables in dependency-safe order (ledger → keys → accounts)
    // TRUNCATE is faster than DELETE and resets sequences
    await sql`TRUNCATE TABLE credit_ledger, virtual_keys, billing_accounts RESTART IDENTITY CASCADE`;

    console.log("✅ Stack test database reset complete");
  } catch (error) {
    console.error("❌ Failed to reset stack test database:", error);
    throw error;
  } finally {
    // Always close the connection to prevent leaks
    await sql.end();
  }

  // No teardown needed for stack tests
  return () => Promise.resolve();
}
