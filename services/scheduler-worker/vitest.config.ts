// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/scheduler-worker/vitest.config`
 * Purpose: Vitest configuration for scheduler-worker package tests.
 * Scope: Package-local tests only; does not import from app src/.
 * Invariants:
 *   - Tests only import from this package or other @cogni/* packages
 *   - No app src/ imports allowed
 * Side-effects: none
 * Links: vitest.workspace.ts, tests/
 * @internal
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineProject } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineProject({
  plugins: [
    tsconfigPaths({
      // Use repo root tsconfig for @cogni/* workspace resolution
      projects: [path.resolve(__dirname, "../../tsconfig.json")],
    }),
  ],
  test: {
    name: "scheduler-worker",
    globals: true,
    environment: "node",
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", "dist"],
    testTimeout: 10_000,
    // Inline the moved attribution-collect package so its src (which imports
    // `viem`) is transformed into this test file's module graph. Without this,
    // the package resolves via its package.json `exports` (dist) as an external
    // module and `vi.mock("viem")` in ledger-activities.test.ts cannot reach the
    // `verifyTypedData` call inside finalizeEpoch — the real viem then rejects
    // the fixture signature with "invalid signature length".
    server: {
      deps: {
        inline: [/@cogni\/attribution-collect/],
      },
    },
  },
});
