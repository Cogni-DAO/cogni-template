// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `vitest.stack.config.mts`
 * Purpose: Vitest configuration for stack tests (HTTP API) requiring running Docker Compose infrastructure.
 * Scope: Configures stack test environment for tests that need full app+postgres+litellm stack. Does not handle unit or pure adapter tests.
 * Invariants: Uses tsconfigPaths plugin for clean @/core resolution; expects running HTTP server; no global setup needed.
 * Side-effects: HTTP requests to running server, database connections via running app
 * Notes: Plugin-only approach eliminates manual alias conflicts; expects TEST_BASE_URL for server location.
 * Links: tsconfig.json paths, stack test files
 * @public
 */

import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import { config } from "dotenv";
import { expand } from "dotenv-expand";

// Load .env.local for stack tests with variable expansion
const env = config({ path: ".env.local" });
expand(env);

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ["tests/stack/**/*.stack.test.ts"],
    environment: "node",
    // No globalSetup - expects running Docker Compose stack
    sequence: { concurrent: false },
  },
});
