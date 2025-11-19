// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `drizzle.config`
 * Purpose: Drizzle ORM configuration for database migrations and schema generation via drizzle-kit.
 * Scope: Database migration configuration and schema paths. Does not handle runtime database connections.
 * Invariants: Schema path matches actual database schema location; migration output directory exists
 * Side-effects: IO (file system operations during migration generation)
 * Notes: Uses serverEnv for DATABASE_URL; strict mode enabled for schema validation
 * Links: Used by pnpm db:generate and pnpm db:migrate scripts
 * @public
 */

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/shared/db/schema.ts",
  out: "./src/adapters/server/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url:
      // eslint-disable-next-line n/no-process-env
      process.env.DATABASE_URL ??
      (() => {
        throw new Error("DATABASE_URL environment variable is required");
      })(),
  },
  verbose: true,
  strict: true,
});
