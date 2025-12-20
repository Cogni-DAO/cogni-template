// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `vitest.integration.config.mts`
 * Purpose: Vitest configuration for integration tests (API + DB) requiring running infrastructure.
 * Scope: Configures integration test environment for tests that need real DB/HTTP server. Does not handle unit tests.
 * Invariants: Uses tsconfigPaths plugin for clean `@/core` resolution; loads .env.test for DB connection; anchored at repo root.
 * Side-effects: process.env (.env.test injection), database connections, HTTP requests
 * Notes: Plugin-only approach eliminates manual alias conflicts; explicit tsconfig.base.json reference ensures path accuracy.
 * Links: tsconfig.base.json paths, integration test files
 * @public
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { expand } from "dotenv-expand";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env.test for integration tests with variable expansion
const env = config({ path: ".env.test" });
expand(env);

export default defineConfig({
  plugins: [tsconfigPaths({ projects: ["./tsconfig.base.json"] })],
  test: {
    include: ["tests/integration/**/*.int.test.ts"],
    environment: "node",
    globalSetup: [
      "./tests/integration/setup/testcontainers-postgres.global.ts",
    ],
    sequence: { concurrent: false },
  },
  resolve: {
    alias: {
      "@tests": path.resolve(__dirname, "./tests"),
    },
  },
});
