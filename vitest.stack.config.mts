// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/* eslint-env node */

/**
 * Module: `vitest.stack.config.mts`
 * Purpose: Vitest configuration for stack tests (HTTP API) requiring running Docker Compose infrastructure.
 * Scope: Configures stack test environment for tests that need full app+postgres+litellm stack. Does not handle unit or pure adapter tests.
 * Invariants: Uses tsconfigPaths plugin for clean @/core resolution; loads env vars for stack test DB; expects running HTTP server.
 * Side-effects: process.env (.env.local + .env.test loading), HTTP requests to running server, database connections
 * Notes: Loads SSL setup for https://localhost connections; runs reset-db.ts globalSetup; sequential test execution.
 * Links: tsconfig.json paths, stack test files, tests/setup.ts
 * @public
 */

import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import { config } from "dotenv";
import { expand } from "dotenv-expand";

// Load base env and expand variables
const baseEnv = config({ path: ".env.local" });
expand(baseEnv);

// Then override with test settings
const testEnv = config({ path: ".env.test", override: true });
expand(testEnv);

// Create combined environment (base values with test overrides)
const combinedEnv = { ...baseEnv.parsed, ...testEnv.parsed };

// Fail fast if required env vars missing
if (!combinedEnv.DB_HOST) {
  throw new Error(
    "DB_HOST environment variable is required for stack tests (localhost?)"
  );
}
if (!combinedEnv.DB_PORT) {
  throw new Error(
    "DB_PORT environment variable is required for stack tests (55432?)"
  );
}

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
