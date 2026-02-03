// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/db/db-url`
 * Purpose: Database URL construction utility for PostgreSQL connections.
 * Scope: Single source of truth for DATABASE_URL construction from env pieces. Safe for both app runtime and tooling. Does not handle connections or validation.
 * Invariants: Pure function; no Next.js/Zod deps; strictly requires POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB, DB_HOST.
 * Side-effects: none
 * Notes: Throws on missing required pieces; no configuration options to keep tooling simple.
 * Links: Used by server env validation and drizzle configuration
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
  const host = env.DB_HOST;
  const port =
    typeof env.DB_PORT === "number"
      ? env.DB_PORT
      : Number(env.DB_PORT ?? "5432");

  if (!user || !password || !db) {
    throw new TypeError(
      "Missing required DB env vars: POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB"
    );
  }

  if (!host) {
    throw new TypeError("Missing required DB env var: DB_HOST");
  }

  if (!Number.isFinite(port)) {
    throw new TypeError(`Invalid DB_PORT value: ${env.DB_PORT}`);
  }

  const base = `postgresql://${user}:${password}@${host}:${port}/${db}`;

  // Per DATABASE_RLS_SPEC.md §SSL_REQUIRED_NON_LOCAL: non-localhost connections
  // must use sslmode=require (or stricter) to prevent credential sniffing.
  const isLocalhost = host === "localhost" || host === "127.0.0.1";
  if (!isLocalhost) {
    return `${base}?sslmode=require`;
  }

  return base;
}
