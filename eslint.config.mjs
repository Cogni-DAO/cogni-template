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
      "import/no-cycle": "error",

      // Block parent relatives only. Aliases unaffected.
      "no-restricted-imports": [
        "error",
        {
          patterns: ["../*", "../../*", "../../../*", "../../../../*"],
        },
      ],

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
          default: "disallow",
          rules: [
            { from: "core", allow: ["core/**"] },
            { from: "ports", allow: ["ports/**", "core/**", "types/**"] },
            {
              from: "features",
              allow: [
                "features/**",
                "ports/**",
                "core/**",
                "shared/**",
                "types/**",
              ],
            },
            {
              from: "contracts",
              allow: ["contracts/**", "shared/**", "types/**"],
            },
            {
              from: "app",
              allow: [
                "app/**",
                "features/**",
                "ports/**",
                "shared/**",
                "contracts/**",
                "types/**",
                "components/**",
                "styles/**",
              ],
            },
            {
              from: "mcp",
              allow: [
                "mcp/**",
                "features/**",
                "ports/**",
                "contracts/**",
                "bootstrap/**",
              ],
            },
            {
              from: "adapters/server",
              allow: [
                "adapters/server/**",
                "ports/**",
                "shared/**",
                "types/**",
              ],
            },
            {
              from: "adapters/worker",
              allow: [
                "adapters/worker/**",
                "ports/**",
                "shared/**",
                "types/**",
              ],
            },
            {
              from: "adapters/cli",
              allow: ["adapters/cli/**", "ports/**", "shared/**", "types/**"],
            },
            { from: "shared", allow: ["shared/**", "types/**"] },
            {
              from: "bootstrap",
              allow: [
                "bootstrap/**",
                "ports/**",
                "adapters/**",
                "shared/**",
                "types/**",
              ],
            },
            {
              from: "components",
              allow: ["components/**", "shared/**", "types/**", "styles/**"],
            },
            { from: "styles", allow: ["styles/**"] },
            { from: "assets", allow: ["assets/**"] },
            { from: "tests", allow: ["**/*"] },
            { from: "e2e", allow: ["**/*"] },
            {
              from: "scripts",
              allow: ["scripts/**", "ports/**", "shared/**", "types/**"],
            },
          ],
        },
      ],
      "boundaries/no-unknown-files": "error",
      "boundaries/entry-point": [
        "error",
        {
          default: "disallow",
          rules: [
            {
              target: [
                "features",
                "ports",
                "adapters/server",
                "shared",
                "contracts",
              ],
              allow: ["**/index.ts", "**/index.tsx"],
            },
          ],
        },
      ],
    },
    settings: {
      "import/resolver": { typescript: true },
      "boundaries/ignore": [
        "**/*.test.*",
        "**/*.spec.*",
        "tests/**",
        "e2e/**",
        "scripts/**",
        "eslint.config.mjs",
        "postcss.config.mjs",
        "next.config.ts",
        "tailwind.config.ts",
        "commitlint.config.cjs",
      ],
      "boundaries/alias": {
        "@core/*": ["src/core/*"],
        "@ports/*": ["src/ports/*"],
        "@features/*": ["src/features/*"],
        "@app/*": ["src/app/*"],
        "@adapters/*": ["src/adapters/*"],
        "@shared/*": ["src/shared/*"],
        "@bootstrap/*": ["src/bootstrap/*"],
        "@components/*": ["src/components/*"],
        "@styles/*": ["src/styles/*"],
        "@types/*": ["src/types/*"],
        "@assets/*": ["src/assets/*"],
        "@contracts/*": ["src/contracts/*"],
        "@mcp/*": ["src/mcp/*"],
      },
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
        { type: "contracts", pattern: "src/contracts/**" },
        { type: "mcp", pattern: "src/mcp/**" },
        { type: "tests", pattern: "tests/**" },
        { type: "e2e", pattern: "e2e/**" },
        { type: "scripts", pattern: "scripts/**" },
      ],
    },
  },

  // Features isolation - block cross-feature imports
  {
    files: ["src/features/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            // forbid importing any other feature via alias
            {
              group: ["@features/*"],
              message: "No cross-feature imports. Depend on ports/core only.",
            },
          ],
        },
      ],
    },
  },

  // Test file overrides
  {
    files: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}", "tests/**", "e2e/**"],
    rules: {
      "boundaries/entry-point": "off",
      "boundaries/element-types": "off",
      "boundaries/no-unknown-files": "off",
      "no-restricted-imports": "off",
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
