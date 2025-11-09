// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@eslint/no-raw-tailwind.config.mjs`
 * Purpose: ESLint configuration for enforcing design token usage over raw Tailwind classes.
 * Scope: Applies custom no-raw-tailwind rule to src files. Does not affect CSS files or vendor components.
 * Invariants: Raw palette/numeric Tailwind utilities trigger warnings; token forms allowed.
 * Side-effects: none
 * Notes: Allows raw classes in tailwind.css and vendor components; warns elsewhere.
 * Links: scripts/eslint/plugins/no-raw-tailwind.cjs, src/styles/theme.ts
 * @public
 */

import noRawTailwind from "../scripts/eslint/plugins/no-raw-tailwind.cjs";

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "no-raw-tailwind": noRawTailwind },
    rules: {
      "no-raw-tailwind/no-raw-tailwind-classes": "warn",
    },
  },
  // Allow raw classes in CSS files and vendor components
  {
    files: ["src/styles/tailwind.css", "src/components/vendor/**/*.tsx"],
    rules: {
      "no-raw-tailwind/no-raw-tailwind-classes": "off",
    },
  },
];
