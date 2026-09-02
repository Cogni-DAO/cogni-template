// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

import { defineConfig } from "tsup";

/** A self-contained process artifact; the Next standalone tracer never imports this entry. */
// biome-ignore lint/style/noDefaultExport: required by tsup
export default defineConfig({
  entry: ["src/bootstrap/compute-workload-controller.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  bundle: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  outDir: "dist-controller",
  noExternal: [/.*/],
  esbuildOptions(options) {
    // The public server-adapter barrel carries Next's `server-only` marker.
    // This standalone server process must select the marker's empty server export.
    options.conditions = ["react-server", "node"];
  },
  banner: {
    // Bundled CommonJS dependencies (notably Kubernetes auth helpers) still call require().
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
  },
});
