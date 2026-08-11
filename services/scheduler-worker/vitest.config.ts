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

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineProject } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Dedupe `viem` to a single physical copy. pnpm installs several peer-scoped
// viem copies; this package and @cogni/attribution-collect (which owns
// finalizeEpoch's `verifyTypedData` call) otherwise resolve to DIFFERENT copies.
// That mismatch means `vi.mock("viem")` in ledger-activities.test.ts mocks one
// copy while finalizeEpoch imports the other, so real viem runs and rejects the
// fixture signature with "invalid signature length". Aliasing forces both to the
// same module so the mock applies uniformly.
const viemDir = path.dirname(require.resolve("viem/package.json"));

export default defineProject({
  plugins: [
    tsconfigPaths({
      // Use repo root tsconfig for @cogni/* workspace resolution
      projects: [path.resolve(__dirname, "../../tsconfig.json")],
    }),
  ],
  resolve: {
    // Exact-match only (regex) so `viem/accounts` and other subpaths keep using
    // the package `exports` map — we only dedupe the bare `viem` specifier. The
    // replacement is the package dir so Vite resolves the correct ESM entry.
    alias: [{ find: /^viem$/, replacement: viemDir }],
  },
  test: {
    name: "scheduler-worker",
    globals: true,
    environment: "node",
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", "dist"],
    testTimeout: 10_000,
  },
});
