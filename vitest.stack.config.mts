// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `vitest.stack.config.mts`
 * Purpose: Vitest configuration for stack tests (HTTP API) requiring running Docker Compose infrastructure.
 * Scope: Configures stack test environment for tests that need full app+postgres+litellm stack. Does not handle unit or pure adapter tests.
 * Invariants: Uses tsconfigPaths plugin for clean `@/core` resolution; expects env vars loaded externally; expects running HTTP server.
 * Side-effects: HTTP requests to running server, database connections
 * Notes: Environment variables loaded by package.json dotenv commands or CI; runs reset-db.ts globalSetup; sequential test execution.
 * Links: tsconfig.json paths, stack test files, tests/setup.ts
 * @public
 */

import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Stack tests require ${name} to be set`);
  }
  return value;
}

// Fail fast if CI / local scripts didn't wire env correctly
requireEnv("DB_HOST");
requireEnv("DB_PORT");
requireEnv("POSTGRES_USER");
requireEnv("POSTGRES_PASSWORD");
requireEnv("POSTGRES_DB");
requireEnv("TEST_BASE_URL");

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ["tests/stack/**/*.stack.test.ts"],
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    globalSetup: ["./tests/stack/setup/reset-db.ts"],
    sequence: { concurrent: false },
  },
});
