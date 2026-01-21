// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/db-client/client`
 * Purpose: Database client factory with injected connection string.
 * Scope: Creates Drizzle database instances. Does not read from environment.
 * Invariants:
 * - Connection string injected, never from process.env
 * - FORBIDDEN: @/shared/env, process.env, Next.js imports
 * Side-effects: IO (database connections)
 * Links: docs/PACKAGES_ARCHITECTURE.md
 * @public
 */

import * as schedulingSchema from "@cogni/db-schema/scheduling";
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

// Database type with scheduling schema
export type Database = PostgresJsDatabase<typeof schedulingSchema>;

/**
 * Creates a Drizzle database client with the given connection string.
 * Connection string is injected to avoid env coupling.
 */
export function createDbClient(connectionString: string): Database {
  const client = postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    connection: {
      application_name: "cogni_scheduler_worker",
    },
  });

  return drizzle(client, { schema: schedulingSchema });
}
