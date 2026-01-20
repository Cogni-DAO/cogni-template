// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/scheduler-worker-service/tsup.config`
 * Purpose: Build configuration for scheduler-worker service.
 * Scope: Defines tsup bundler settings for deployable service. Does not contain runtime code.
 * Invariants: ESM format only, bundles deps for Docker image.
 * Side-effects: none
 * Links: services/scheduler-worker/Dockerfile
 * @internal
 */

import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/main.ts"],
  format: ["esm"],
  bundle: true,
  splitting: false,
  dts: false,
  clean: true,
  sourcemap: true,
  platform: "node",
  target: "node20",
  // Bundle all deps for Docker image (except native modules)
  noExternal: [/.*/],
  external: ["postgres"],
});
