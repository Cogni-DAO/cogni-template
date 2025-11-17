// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@eslint/ui-governance.config.mjs`
 * Purpose: Enforce token-driven Tailwind usage while allowing ergonomic layout classes.
 * Scope: Applies custom UI governance rules (no raw colors, token patterns, vendor isolation).
 * Invariants: Rules run across `src/**` except styles/ + vendor/ dirs where literals are expected.
 * Side-effects: none
 * Notes: Backed by machine-readable spec in docs/ui-style-spec.json.
 * Links: docs/ARCHITECTURE.md#styling-invariants, docs/ui-style-spec.json
 * @public
 */

import uiGovernance from "../scripts/eslint/plugins/ui-governance.cjs";

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      "ui-governance": uiGovernance,
    },
    rules: {
      "ui-governance/no-raw-colors": "error",
      "ui-governance/no-arbitrary-non-token-values": "error",
      "ui-governance/token-classname-patterns": "error",
      "ui-governance/no-vendor-imports-outside-kit": "error",
    },
  },
  {
    files: ["src/components/vendor/**/*.{ts,tsx}", "src/styles/**/*.{ts,tsx}"],
    rules: {
      "ui-governance/no-raw-colors": "off",
      "ui-governance/no-arbitrary-non-token-values": "off",
      "ui-governance/token-classname-patterns": "off",
      "ui-governance/no-vendor-imports-outside-kit": "off",
    },
  },
];
