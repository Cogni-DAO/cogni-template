// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/scheduler-worker/tsup.config`
 * Purpose: Build configuration for scheduler-worker package.
 * Scope: Defines tsup bundler settings. Does not contain runtime code.
 * Invariants: ESM format only, external workspace deps.
 * Side-effects: none
 * Links: packages/scheduler-worker/package.json
 * @internal
 */

import { defineConfig } from "tsup";

export const tsupConfig = defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  bundle: true,
  splitting: false,
  dts: false, // tsc -b generates declarations (structure differs but types match)
  clean: false, // preserve .d.ts files from tsc -b
  sourcemap: true,
  platform: "node",
  // Externalize all runtime deps (they're installed in node_modules)
  external: ["graphile-worker", "cron-parser", "zod", "crypto"],
});

export default tsupConfig;
