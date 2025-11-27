// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/integration/setup/testcontainers-postgres.global`
 * Purpose: Vitest global setup for testcontainers-based PostgreSQL integration tests.
 * Scope: Manages PostgreSQL container lifecycle for pure adapter integration tests. Does not handle stack tests.
 * Invariants: Creates isolated DB per test run; runs migrations; provides clean DATABASE_URL to test environment.
 * Side-effects: IO (Docker containers, process.env, file system)
 * Notes: Used by vitest.integration.config.mts as globalSetup; sets APP_ENV=test for fake adapters.
 * Links: vitest integration config, database migration scripts
 * @internal
 */

import { execSync } from "node:child_process";

import { PostgreSqlContainer } from "@testcontainers/postgresql";

export async function setup() {
  const c = await new PostgreSqlContainer("postgres:15-alpine").start();
  process.env.DATABASE_URL = c.getConnectionUri();
  process.env.APP_ENV = "test";
  execSync("pnpm db:migrate:test", { stdio: "inherit" });
  return async () => {
    await c.stop();
  };
}
