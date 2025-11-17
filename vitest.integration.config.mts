// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `vitest.integration.config.mts`
 * Purpose: Vitest configuration for integration tests (API + DB) requiring running infrastructure.
 * Scope: Configures integration test environment for tests that need real DB/HTTP server. Does not handle unit tests.
 * Invariants: Uses tsconfigPaths plugin for clean @/core resolution; loads .env.local for DB connection; anchored at repo root.
 * Side-effects: process.env (.env.local injection), database connections, HTTP requests
 * Notes: Plugin-only approach eliminates manual alias conflicts; explicit tsconfig.json reference ensures path accuracy.
 * Links: tsconfig.json paths, integration test files
 * @public
 */

import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import { config } from "dotenv";
import { expand } from "dotenv-expand";

// Load .env.local for API integration tests with variable expansion
const env = config({ path: ".env.local" });
expand(env);

export default defineConfig({
  root: ".",
  plugins: [
    tsconfigPaths({
      projects: ["./tsconfig.json"],
    }),
  ],
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: [
      "tests/integration/**/*.int.test.ts",
      "tests/integration/**/*.spec.ts"
    ],
    exclude: [
      "node_modules",
      "dist",
      ".next",
      "tests/_fakes/**",
      "tests/_fixtures/**",
    ],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
