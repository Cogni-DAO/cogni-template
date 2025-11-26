// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@eslint/base.config.mjs`
 * Purpose: Core ESLint rules for TypeScript, imports, and Node.js best practices.
 * Scope: Covers TypeScript files (.ts/.tsx/.mts), import sorting/resolution, code quality rules. Does not handle React/Next.js rules.
 * Invariants: All TypeScript files validated; imports sorted.
 * Side-effects: none
 * Notes: Core linting for base language features and imports.
 * Links: eslint.config.mjs, app.config.mjs
 * @public
 */

import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import prettierConfig from "eslint-config-prettier";
import importPlugin from "eslint-plugin-import";
import nodePlugin from "eslint-plugin-n";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tsdoc from "eslint-plugin-tsdoc";
import unicorn from "eslint-plugin-unicorn";
import globals from "globals";

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
      import: importPlugin,
      tsdoc: tsdoc,
      unicorn: unicorn,
      n: nodePlugin,
    },
    rules: {
      ...tsPlugin.configs.strict.rules,
      ...tsPlugin.configs["stylistic-type-checked"].rules,

      // TypeScript strict rules
      // Disable rules now handled by Biome
      "@typescript-eslint/no-unused-vars": "off", // Biome: noUnusedVariables
      "@typescript-eslint/no-explicit-any": "off", // Biome: noExplicitAny

      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          checksVoidReturn: { attributes: false },
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
