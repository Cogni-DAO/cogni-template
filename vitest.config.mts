// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `vitest.config`
 * Purpose: Vitest test runner configuration for unit tests, contract tests, and lint tests (no infrastructure required).
 * Scope: Configures test environment for fast tests only. Excludes integration tests requiring DB/HTTP server.
 * Invariants: Coverage disabled by default; fast execution; v8 provider for Node.js compatibility.
 * Side-effects: file system (coverage reports written to ./coverage/)
 * Notes: Uses vite-tsconfig-paths for module resolution; excludes tests/integration/** from main test run.
 * Links: SonarCloud integration workflow
 * @public
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: [
      "tests/**/*.{test,spec}.{ts,tsx}",
      "packages/*/tests/**/*.{test,spec}.{ts,tsx}",
    ],
    exclude: [
      "node_modules",
      "dist",
      ".next",
      "e2e",
      "tests/_fakes/**",
      "tests/_fixtures/**",
      "tests/integration/**",
      "tests/stack/**",
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
