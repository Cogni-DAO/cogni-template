// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `drizzle.config`
 * Purpose: Drizzle ORM configuration for database migrations and schema generation via drizzle-kit.
 * Scope: Database migration configuration and schema paths. Does not handle runtime database connections.
 * Invariants: Schema path matches actual database schema location; migration output directory exists
 * Side-effects: IO (file system operations during migration generation)
 * Notes: Uses DATABASE_URL directly if available, falls back to buildDatabaseUrl helper; strict mode enabled for schema validation
 * Links: Used by pnpm db:generate and pnpm db:migrate scripts
 * @public
 */

import { defineConfig } from "drizzle-kit";

import { buildDatabaseUrl, type DbEnvInput } from "./src/shared/db/db-url";

function getDatabaseUrl(): string {
  // Use DATABASE_URL directly if available (testcontainers, platforms)
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  // Fall back to constructing from individual pieces (canonical local dev)
  return buildDatabaseUrl(process.env as DbEnvInput);
}

export default defineConfig({
  schema: "./src/shared/db/schema.ts",
  out: "./src/adapters/server/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: getDatabaseUrl(),
  },
  verbose: true,
  strict: true,
});
