import js from "@eslint/js";
import globals from "globals";
import nextPlugin from "@next/eslint-plugin-next";
// Tailwind CSS linting
// import officialTailwind from "eslint-plugin-tailwindcss"; // TODO: switch back when v4 stable
import communityTailwind from "@poupe/eslint-plugin-tailwindcss";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import prettierConfig from "eslint-config-prettier";
import boundaries from "eslint-plugin-boundaries";
import importPlugin from "eslint-plugin-import";
import noInlineStyles from "eslint-plugin-no-inline-styles";
import simpleImportSort from "eslint-plugin-simple-import-sort";
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
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
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
      "@next/next": nextPlugin,
      // "tailwindcss": officialTailwind, // TODO: re-enable after upstream v4 fix
      tailwindcss: communityTailwind,
      "simple-import-sort": simpleImportSort,
      "no-inline-styles": noInlineStyles,
      "unused-imports": unused,
      import: importPlugin,
      boundaries: boundaries,
    },
    rules: {
      ...tsPlugin.configs.strict.rules,
      ...tsPlugin.configs["stylistic-type-checked"].rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,

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

      // Tailwind rules (community plugin has different rule names)
      // TODO: restore official rules when switching back to official plugin
      // "tailwindcss/no-arbitrary-value": "error",
      // "tailwindcss/classnames-order": "off", // Prettier plugin handles order

      // No inline styles
      "no-inline-styles/no-inline-styles": "error",

      // Hexagonal architecture boundaries enforcement
      "boundaries/element-types": [
        "error",
        {
          default: "allow",
          rules: [
            // Core can only import from core (standalone domain)
            {
              from: "core",
              disallow: ["app", "features", "adapters/*", "ports", "shared"],
            },

            // Ports can only import from core
            {
              from: "ports",
              disallow: ["app", "features", "adapters/*", "shared"],
            },

            // Features can import from ports, core, shared
            { from: "features", disallow: ["app", "adapters/*"] },

            // App can import from features, ports, shared (never adapters)
            { from: "app", disallow: ["adapters/*", "core"] },

            // Adapters can import from ports, shared (never app, features, core)
            { from: "adapters/server", disallow: ["app", "features", "core"] },
            { from: "adapters/worker", disallow: ["app", "features", "core"] },
            { from: "adapters/cli", disallow: ["app", "features", "core"] },
          ],
        },
      ],
      // TODO: Fix no-unknown-files rule configuration
      // "boundaries/no-unknown-files": [
      //   "error",
      //   {
      //     ignore: [
      //       "**/*.test.*",
      //       "**/*.spec.*",
      //       "scripts/**",
      //       "eslint.config.mjs",
      //       "postcss.config.mjs",
      //       "next.config.ts",
      //       "tailwind.config.ts",
      //       "commitlint.config.cjs",
      //     ],
      //   },
      // ],
    },
    settings: {
      "import/resolver": { typescript: true },
      tailwindcss: {
        config: "tailwind.config.ts",
        callees: ["clsx", "cn", "classnames"],
      },
      "boundaries/elements": [
        { type: "app", pattern: "src/app/**" },
        { type: "features", pattern: "src/features/**" },
        { type: "ports", pattern: "src/ports/**" },
        { type: "core", pattern: "src/core/**" },
        { type: "adapters/server", pattern: "src/adapters/server/**" },
        { type: "adapters/worker", pattern: "src/adapters/worker/**" },
        { type: "adapters/cli", pattern: "src/adapters/cli/**" },
        { type: "shared", pattern: "src/shared/**" },
        { type: "bootstrap", pattern: "src/bootstrap/**" },
        { type: "components", pattern: "src/components/**" },
        { type: "styles", pattern: "src/styles/**" },
        { type: "types", pattern: "src/types/**" },
        { type: "assets", pattern: "src/assets/**" },
        { type: "tests", pattern: "tests/**" },
        { type: "e2e", pattern: "e2e/**" },
        { type: "scripts", pattern: "scripts/**" },
      ],
    },
  },

  // Test file overrides
  {
    files: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: {
      "boundaries/entry-point": "off",
      "boundaries/element-types": "off",
    },
  },

  // Next.js font file overrides
  {
    files: ["src/**/font*.{ts,tsx}"],
    rules: {
      "no-inline-styles/no-inline-styles": "off",
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
      "node_modules/**",
      "commitlint.config.cjs",
      "*.config.cjs",
    ],
  },
];
