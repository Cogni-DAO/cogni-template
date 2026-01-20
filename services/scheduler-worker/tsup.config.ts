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
  entry: ["src/**/*.ts"], // Transpile all source files
  format: ["esm"],
  bundle: false, // Model B: transpile-only, node_modules copied to Docker image
  splitting: false,
  dts: false,
  clean: true,
  sourcemap: true,
  platform: "node",
  target: "node20",
});
