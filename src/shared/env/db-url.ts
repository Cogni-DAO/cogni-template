// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/env/db-url`
 * Purpose: Single source of truth for constructing PostgreSQL DATABASE_URL from env pieces.
 * Scope: Safe to import from both app env (`serverEnv`) and tooling (`drizzle.config.ts`). Does not handle validation or defaults.
 * Invariants: No Next.js imports, no zod, no side-effects; pure function only.
 * Side-effects: none
 * Notes: Throws on missing required pieces; no configuration options to keep tooling simple.
 * Links: Environment configuration specification
 * @public
 */

export interface DbEnvInput {
  POSTGRES_USER?: string;
  POSTGRES_PASSWORD?: string;
  POSTGRES_DB?: string;
  DB_HOST?: string;
  DB_PORT?: string | number;
}

export function buildDatabaseUrl(env: DbEnvInput): string {
  const user = env.POSTGRES_USER;
  const password = env.POSTGRES_PASSWORD;
  const db = env.POSTGRES_DB;
  const host = env.DB_HOST ?? "localhost";
  const port =
    typeof env.DB_PORT === "number"
      ? env.DB_PORT
      : Number(env.DB_PORT ?? "5432");

  if (!user || !password || !db) {
    throw new TypeError(
      "Missing required DB env vars: POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB"
    );
  }

  if (!Number.isFinite(port)) {
    throw new Error(`Invalid DB_PORT value: ${env.DB_PORT}`);
  }

  return `postgresql://${user}:${password}@${host}:${port}/${db}`;
}
