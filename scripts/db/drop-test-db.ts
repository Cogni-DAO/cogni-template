#!/usr/bin/env tsx
// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@scripts/db/drop-test-db`
 * Purpose: Safe test database drop utility with multiple hardcoded safety guards to prevent accidental production database deletion.
 * Scope: Operates only on hardcoded test database "cogni_template_stack_test" on localhost. Does not support remote or production databases.
 * Invariants: Hard-coded database name check; localhost-only operation; APP_ENV=test requirement prevents prod execution.
 * Side-effects: IO (database operations, console output), process.env
 * Notes: Multiple safety layers including whitelist validation and environment checks; integrates with test:stack:reset workflow.
 * Links: Used by package.json test:stack:db:drop command
 * @public
 */

import { config } from "dotenv";
import postgres from "postgres";

import { buildDatabaseUrl } from "@/shared/db/db-url";

// === SAFETY CONFIGURATION ===
// These are the ONLY values this script will operate on - hardcoded for security
const EXPECTED_TEST_DB = "cogni_template_stack_test";
const SAFE_HOSTS = new Set(["localhost", "127.0.0.1"]);

async function main(): Promise<void> {
  console.log("🔒 Test Database Drop Script - Safety checks starting...");

  // 1) Load test environment ON PURPOSE, override any shell environment
  config({ path: ".env.test", override: true });
  // Load base config (no override)
  config({ path: ".env.local" });

  // 2) Read effective configuration values
  const dbName = process.env.POSTGRES_DB;
  const host = process.env.DB_HOST ?? "localhost";
  const user = process.env.POSTGRES_USER;
  const password = process.env.POSTGRES_PASSWORD;
  const port = Number(process.env.DB_PORT ?? "5432");

  console.log(`📋 Configuration loaded:`);
  console.log(`   Database: ${dbName}`);
  console.log(`   Host: ${host}:${port}`);
  console.log(`   APP_ENV: ${process.env.APP_ENV}`);

  // 3) PRIMARY SAFETY GUARD: Hard-coded database and host restrictions
  if (dbName !== EXPECTED_TEST_DB) {
    throw new Error(
      `❌ SAFETY VIOLATION: Database name "${dbName}" does not match expected test DB.\n` +
        `   Expected: "${EXPECTED_TEST_DB}"\n` +
        `   This script ONLY operates on the hardcoded test database.`
    );
  }

  if (!SAFE_HOSTS.has(host)) {
    throw new Error(
      `❌ SAFETY VIOLATION: Host "${host}" is not in the safe hosts list.\n` +
        `   Allowed hosts: ${Array.from(SAFE_HOSTS).join(", ")}\n` +
        `   This script ONLY operates on localhost connections.`
    );
  }

  // 4) SECONDARY SAFETY GUARD: Environment flag verification
  if (process.env.APP_ENV !== "test") {
    throw new Error(
      `❌ SAFETY VIOLATION: APP_ENV must be "test" to run this script.\n` +
        `   Current APP_ENV: "${process.env.APP_ENV}"\n` +
        `   This prevents accidental execution in non-test environments.`
    );
  }

  // 5) Validate required connection parameters
  if (!user || !password) {
    throw new Error(
      `❌ CONFIGURATION ERROR: Missing required database credentials.\n` +
        `   POSTGRES_USER: ${user ? "✓" : "❌ missing"}\n` +
        `   POSTGRES_PASSWORD: ${password ? "✓" : "❌ missing"}`
    );
  }

  console.log(
    "✅ All safety checks passed - proceeding with test database drop"
  );

  // 6) Connect to PostgreSQL (to postgres database, not the target database)
  const adminUrl = buildDatabaseUrl({
    POSTGRES_USER: user,
    POSTGRES_PASSWORD: password,
    // Connect to admin database
    POSTGRES_DB: "postgres",
    DB_HOST: host,
    DB_PORT: port,
  });

  const sql = postgres(adminUrl, {
    // Single connection
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  try {
    console.log(`🗑️  Attempting to drop test database: ${dbName}`);

    // 7) Drop the database (will fail safely if database doesn't exist)
    await sql.unsafe(`DROP DATABASE IF EXISTS ${dbName}`);

    console.log(`✅ Successfully dropped test database: ${dbName}`);
    console.log("💡 Use 'pnpm test:stack:setup' to recreate the test database");
  } catch (error) {
    console.error(`❌ Failed to drop test database: ${dbName}`);
    console.error("Error details:", error);
    throw error;
  } finally {
    // 8) Always close the connection
    await sql.end();
  }
}

// Execute the script
main().catch((error: Error) => {
  console.error("\n💥 Script failed with error:");
  console.error(error.message);
  process.exit(1);
});
