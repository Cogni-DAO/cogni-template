// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@eslint/base.config.mjs`
 * Purpose: Core ESLint rules for TypeScript, imports, and Node.js best practices.
 * Scope: Covers TypeScript files (.ts/.tsx/.mts), import sorting/resolution, code quality rules, process.env restrictions. Does not handle React/Next.js rules.
 * Invariants: All TypeScript files validated; imports sorted; process.env restricted to allowed files.
 * Side-effects: none
 * Notes: Includes n/no-process-env rule with allowlist for env files and infrastructure.
 * Links: eslint.config.mjs, app.config.mjs
 * @public
 */

import js from "@eslint/js";
import globals from "globals";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import prettierConfig from "eslint-config-prettier";
import importPlugin from "eslint-plugin-import";
import nodePlugin from "eslint-plugin-n";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tsdoc from "eslint-plugin-tsdoc";
import unicorn from "eslint-plugin-unicorn";
import unused from "eslint-plugin-unused-imports";

/** @type {import('eslint').Linter.Config[]} */
export default [
  js.configs.recommended,

  // JS/MJS config files - use Espree (default JS parser)
  {
    files: ["**/*.mjs", "**/*.cjs"],
    languageOptions: {
      sourceType: "module",
      ecmaVersion: "latest",
      globals: {
        ...globals.node,
      },
    },
  },

  // TypeScript files only
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.mts"],
    languageOptions: {
      parser: tsParser,
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "simple-import-sort": simpleImportSort,
      "unused-imports": unused,
      import: importPlugin,
      tsdoc: tsdoc,
      unicorn: unicorn,
      n: nodePlugin,
    },
    rules: {
      ...tsPlugin.configs.strict.rules,
      ...tsPlugin.configs["stylistic-type-checked"].rules,

      // TypeScript strict rules
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "unused-imports/no-unused-imports": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          checksVoidReturn: { attributes: false },
        },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
        },
      ],
      "@typescript-eslint/explicit-function-return-type": [
        "warn",
        {
          allowExpressions: true,
        },
      ],

      // Import sorting
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",

      // Import resolution
      "import/no-unresolved": "error",
      "import/no-cycle": "error",

      // Node.js rules
      "n/no-process-env": "error",

      // File header documentation: REUSE enforces SPDX, tsdoc validates TSDoc syntax
      "tsdoc/syntax": "error",
      // Avoid mid-code comments (allow eslint-disable and ts-ignore)
      "no-inline-comments": [
        "error",
        {
          ignorePattern: "eslint-disable|ts-ignore|ts-expect-error|ts-check",
        },
      ],
    },
    settings: {
      "import/resolver": { typescript: true },
    },
  },

  // Allow process.env only in environment files, auth config, and E2E infrastructure
  {
    files: [
      "src/shared/env/**/*.{ts,tsx}",
      "src/auth.ts", // Auth.js needs NODE_ENV for trustHost and domain config
      "e2e/**/*.{ts,tsx}",
      "playwright.config.ts",
      "tests/**/*.ts",
      "scripts/**/*.ts",
      "docs/templates/**/*.ts",
      "*.config.{ts,mts}",
      "drizzle.config.ts",
    ],
    rules: { "n/no-process-env": "off" },
  },

  prettierConfig,

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
      "**/*.md",
      "**/*.css",
      "**/.env*",
      "**/*.yaml",
      "**/*.yml",
    ],
  },
];
