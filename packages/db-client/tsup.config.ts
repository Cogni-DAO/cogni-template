// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/db-client/tsup.config`
 * Purpose: Build configuration for db-client package.
 * Scope: Build tooling only. Does not contain runtime code.
 * Invariants: Output must be ESM with type declarations.
 * Side-effects: IO
 * Links: docs/SCHEDULER_SERVICE_REFACTOR.md
 * @internal
 */

import { defineConfig } from "tsup";

export const tsupConfig = defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: false, // tsc -b emits per-file declarations; tsup handles JS only
  clean: false, // preserve .d.ts files from tsc -b (incremental builds)
  sourcemap: true,
  platform: "node",
  external: [
    "drizzle-orm",
    "postgres",
    "@cogni/db-schema",
    "@cogni/scheduler-core",
  ],
});

export default tsupConfig;
