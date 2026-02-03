// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/db-client/client`
 * Purpose: Database client factories with injected connection string.
 * Scope: Creates Drizzle database instances for app_user and app_service roles. Does not read from environment.
 * Invariants:
 * - Connection string injected, never from process.env
 * - FORBIDDEN: @/shared/env, process.env, Next.js imports
 * - createServiceDbClient must NOT be used in Next.js web runtime code
 * Side-effects: IO (database connections)
 * Links: docs/PACKAGES_ARCHITECTURE.md, docs/DATABASE_RLS_SPEC.md
 * @public
 */

import * as fullSchema from "@cogni/db-schema";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

/**
 * Simple logger interface for optional logging in adapters.
 * Consumers can inject their own logger (e.g., pino).
 */
export interface LoggerLike {
  info: (obj: Record<string, unknown>, msg: string) => void;
  warn: (obj: Record<string, unknown>, msg: string) => void;
  error: (obj: Record<string, unknown>, msg: string) => void;
  debug: (obj: Record<string, unknown>, msg: string) => void;
}

// Database type with full schema (all domain slices)
export type Database = PostgresJsDatabase<typeof fullSchema>;

function buildClient(
  connectionString: string,
  applicationName: string
): Database {
  const client = postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    connection: {
      application_name: applicationName,
    },
  });

  return drizzle(client, { schema: fullSchema });
}

/**
 * Creates a Drizzle database client for the `app_user` role (RLS enforced).
 * Use this for all user-facing request paths.
 */
export function createAppDbClient(connectionString: string): Database {
  return buildClient(connectionString, "cogni_template_app");
}

/**
 * Creates a Drizzle database client for the `app_service` role (BYPASSRLS).
 * Use this for scheduler workers, internal services, and auth bootstrap only.
 * Must NOT be used in the Next.js web runtime (enforced by import boundary).
 */
export function createServiceDbClient(connectionString: string): Database {
  return buildClient(connectionString, "cogni_service");
}

/**
 * Creates a Drizzle database client with the given connection string.
 * @deprecated Use {@link createAppDbClient} or {@link createServiceDbClient}.
 */
export function createDbClient(connectionString: string): Database {
  return buildClient(connectionString, "cogni_scheduler_worker");
}
