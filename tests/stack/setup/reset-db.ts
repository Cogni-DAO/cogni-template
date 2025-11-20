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

import { sql } from "drizzle-orm";

import { db } from "@/adapters/server/db/drizzle.client";

export default async () => {
  console.log("🧹 Resetting stack test database...");

  try {
    // Wipe tables in dependency-safe order
    // TRUNCATE is faster than DELETE and resets sequences
    await db.execute(sql`TRUNCATE TABLE accounts RESTART IDENTITY CASCADE`);

    // Add more tables here as needed for stack tests
    // Example: await db.execute(sql`TRUNCATE TABLE credit_ledger, other_table RESTART IDENTITY CASCADE`);

    console.log("✅ Stack test database reset complete");
  } catch (error) {
    console.error("❌ Failed to reset stack test database:", error);
    throw error;
  }

  // No teardown needed for stack tests
  return () => Promise.resolve();
};
