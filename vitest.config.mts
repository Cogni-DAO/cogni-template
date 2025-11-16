// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `vitest.config`
 * Purpose: Vitest test runner configuration with coverage reporting for unit and integration tests.
 * Scope: Configures test environment, file patterns, coverage providers, and reporting formats. Excludes e2e tests.
 * Invariants: Coverage enabled by default; lcov and json-summary formats for SonarCloud integration; v8 provider for Node.js compatibility.
 * Side-effects: file system (coverage reports written to ./coverage/)
 * Notes: Uses vite-tsconfig-paths for module resolution; excludes API tests from main test run.
 * Links: SonarCloud integration workflow
 * @public
 */

import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.{test,spec}.ts"],
    exclude: [
      "node_modules",
      "dist",
      ".next",
      "e2e",
      "tests/_fakes/**",
      "tests/_fixtures/**",
      "tests/api/**",
    ],
    coverage: {
      enabled: false,
      provider: "v8",
      reporter: ["lcov", "json-summary", "text", "html"],
      reportsDirectory: "coverage",
      exclude: [
        "node_modules/",
        "tests/",
        "e2e/",
        ".next/",
        "dist/",
        "**/*.d.ts",
        "**/*.config.*",
        "**/index.ts",
      ],
    },
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      "@tests": path.resolve(__dirname, "./tests"),
    },
  },
});
