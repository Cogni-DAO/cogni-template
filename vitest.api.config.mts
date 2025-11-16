// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `vitest.api.config.mts`
 * Purpose: Vitest configuration for API integration tests with simplified TypeScript path resolution.
 * Scope: Configures API test environment and module resolution. Does not handle unit tests.
 * Invariants: Uses tsconfigPaths plugin for clean @/core resolution; loads .env.test for isolation; anchored at repo root.
 * Side-effects: process.env (.env.test injection)
 * Notes: Plugin-only approach eliminates manual alias conflicts; explicit tsconfig.json reference ensures path accuracy.
 * Links: tsconfig.json paths, API test files
 * @public
 */

import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import { config } from "dotenv";

// Load .env.local for API integration tests
config({ path: ".env.local" });

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
    include: ["tests/api/**/*.{test,spec}.ts"],
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
