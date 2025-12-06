// UI GOVERNANCE ONLY
// All other linting (TS, imports, React, a11y, boundaries, etc.) handled by Biome
// ESLint reduced to: UI token governance + Tailwind rules + no-inline-styles
import tsParser from "@typescript-eslint/parser";
import tests from "./eslint/tests.config.mjs";
import uiGovernance from "./eslint/ui-governance.config.mjs";

/** @type {import('eslint').Linter.Config[]} */
export default [
  // Global ignores - no rules, just paths ESLint should skip
  {
    ignores: [
      ".next/**",
      "out/**",
      "dist/**",
      "coverage/**",
      "*.d.ts",
      "**/*.gen.*",
      "node_modules/**",
      "commitlint.config.cjs",
      "*.config.cjs",
      "test*/**/fixtures/**",
      "**/__arch_probes__/**",
      "**/*.md",
      "**/*.css",
      "**/.env*",
      "**/*.yaml",
      "**/*.yml",
      "platform/infra/services/sourcecred/instance/**",
    ],
  },
  // Parser config for UI files ONLY - no rules, just enables TS/JSX parsing
  {
    files: ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
  },
  ...uiGovernance,
  ...tests,
];
