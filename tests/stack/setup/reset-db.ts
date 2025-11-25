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

  // Verify we are connecting to the expected host/port = parsedUrl.hostname;

  const sql = postgres(databaseUrl, {
    max: 1, // Use only one connection for setup
    connection: {
      application_name: "vitest_stack_reset",
    },
  });

  const expectedDb = process.env.POSTGRES_DB;

  try {
    const [connectionInfo] = await sql<
      {
        current_database: string | null;
        server_port: number;
        server_addr: string | null;
      }[]
    >`
      SELECT current_database(), inet_server_port() AS server_port, inet_server_addr()::text AS server_addr
    `;

    if (!connectionInfo?.current_database) {
      throw new Error("Failed to determine connected database name");
    }

    // SAFETY: Never allow reset on dev/prod databases, even if env matches
    const UNSAFE_DBS = ["cogni_template_dev", "cogni_template_prod"];
    if (UNSAFE_DBS.includes(connectionInfo.current_database)) {
      throw new Error(
        `❌ SAFETY VIOLATION: Attempted to reset unsafe database "${connectionInfo.current_database}".\n` +
          `   This script is only for test databases (e.g. cogni_template_stack_test).`
      );
    }

    if (expectedDb && connectionInfo.current_database !== expectedDb) {
      throw new Error(
        `Connected to unexpected database: ${connectionInfo.current_database} (expected ${expectedDb})`
      );
    }

    // Port check removed: Docker port mapping (external 55432 vs internal 5432) causes false positives.
    // We rely on the database name check above for safety.

    console.log(
      `🔌 Connected to ${connectionInfo.current_database} @ ${connectionInfo.server_addr ?? "unknown"}:${connectionInfo.server_port}`
    );

    // Dynamically discover all user tables (exclude postgres system tables)
    const tables = await sql<{ tablename: string }[]>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
    `;

    if (tables.length === 0) {
      console.log("⚠️  No tables found in public schema - skipping truncate");
      return () => Promise.resolve();
    }

    // Build TRUNCATE statement with all discovered tables
    // Quote each table name to handle mixed-case PostgreSQL identifiers (e.g., LiteLLM_AuditLog)
    const tableNames = tables.map((t) => `"${t.tablename}"`).join(", ");

    // TRUNCATE with CASCADE handles foreign key constraints automatically
    await sql.unsafe(`TRUNCATE TABLE ${tableNames} RESTART IDENTITY CASCADE`);

    console.log(
      `✅ Stack test database reset complete (${tables.length} tables truncated)`
    );
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
