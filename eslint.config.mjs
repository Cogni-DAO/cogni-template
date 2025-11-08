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
import jsxA11y from "eslint-plugin-jsx-a11y";
import noInlineStyles from "eslint-plugin-no-inline-styles";
import noLiteralClassnames from "eslint-plugin-no-literal-classnames";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
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
    files: ["**/*.ts", "**/*.tsx"],
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
      "@next/next": nextPlugin,
      // "tailwindcss": officialTailwind, // TODO: re-enable after upstream v4 fix
      tailwindcss: communityTailwind,
      "simple-import-sort": simpleImportSort,
      "no-inline-styles": noInlineStyles,
      "no-literal-classnames": noLiteralClassnames,
      "unused-imports": unused,
      import: importPlugin,
      boundaries: boundaries,
      "jsx-a11y": jsxA11y,
      react: react,
      "react-hooks": reactHooks,
      tsdoc: tsdoc,
      unicorn: unicorn,
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

      // Block parent relatives and restricted imports
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../**"],
              message: "Do not import from parent directories. Use aliases.",
            },
            {
              group: ["@/components/vendor/**"],
              message:
                "Use @/components/kit/* wrappers instead of direct vendor imports",
            },
          ],
          paths: [
            {
              name: "clsx",
              message:
                "Only allowed in src/styles/** and src/components/vendor/** - use styling API from @/styles/ui instead",
            },
            {
              name: "tailwind-merge",
              message:
                "Only allowed in src/styles/** and src/components/vendor/** - use styling API from @/styles/ui instead",
            },
          ],
        },
      ],

      // Block literal className usage - force styling API
      "no-literal-classnames/no-literal-classnames": "error",

      // Block specific className patterns
      "no-restricted-syntax": [
        "error",
        // 1) Direct string literal as the attribute value
        {
          selector: "JSXAttribute[name.name='className'] > Literal",
          message:
            "Use CVA from @/styles/ui. Direct string className forbidden.",
        },
        // 2) Template literal directly used as the attribute value
        {
          selector:
            "JSXAttribute[name.name='className'] > JSXExpressionContainer > TemplateLiteral",
          message:
            "Use CVA from @/styles/ui. Template literal className forbidden.",
        },
        // 3) cn(...) with any literal arg anywhere under className
        {
          selector:
            "JSXAttribute[name.name='className'] > JSXExpressionContainer CallExpression[callee.name='cn'] Literal",
          message:
            "Use CVA from @/styles/ui. cn(...) with literal strings forbidden.",
        },
      ],

      // React rules
      "react/react-in-jsx-scope": "off",

      // React hooks rules
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // Accessibility rules
      ...jsxA11y.configs.recommended.rules,
      "jsx-a11y/alt-text": "error",
      "jsx-a11y/anchor-is-valid": "error",
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/interactive-supports-focus": "error",

      // Tailwind rules (community plugin has different rule names)
      // TODO: restore official rules when switching back to official plugin
      "tailwindcss/no-conflicting-utilities": "error",
      "tailwindcss/no-arbitrary-value-overuse": [
        "error",
        {
          maxPerFile: 10,
          maxPerRule: 3,
          allowedUtilities: ["rounded-[--radius]", "shadow-[--shadow]"],
        },
      ],
      "tailwindcss/prefer-theme-tokens": [
        "warn", // Will be error in CI for main branch
        {
          categories: ["colors", "spacing"],
        },
      ],
      "tailwindcss/valid-theme-function": "error",
      "tailwindcss/valid-apply-directive": "error",
      // TODO: Add when available in @poupe plugin
      // "tailwindcss/no-custom-classname": "warn",
      // "tailwindcss/classnames-order": "off", // Prettier plugin handles order

      // No inline styles
      "no-inline-styles/no-inline-styles": "error",

      // File header documentation: REUSE enforces SPDX, tsdoc validates TSDoc syntax
      "tsdoc/syntax": "error",
      // Avoid mid-code comments (allow eslint-disable and ts-ignore)
      "no-inline-comments": [
        "error",
        {
          ignorePattern: "eslint-disable|ts-ignore|ts-expect-error|ts-check",
        },
      ],

      // Hexagonal architecture boundaries enforcement
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: [
            { from: "core", allow: ["core"] },
            { from: "ports", allow: ["ports", "core", "types"] },
            {
              from: "features",
              allow: [
                "features/**",
                "ports/**",
                "core/**",
                "shared/**",
                "types/**",
                "components",
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
                "ports",
                "adapters/server",
                "shared",
                "contracts",
                "components",
              ],
              allow: ["**/index.ts", "**/index.tsx"],
            },
            {
              target: ["styles"],
              allow: ["ui.ts"],
            },
            {
              target: ["features"],
              allow: ["**/*.{ts,tsx}"],
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
        { type: "docs", pattern: "docs/**" },
      ],
    },
  },

  // Features: only import the barrel or kit subpaths
  {
    files: ["src/features/**/*.{ts,tsx}"],
    rules: {
      "import/no-internal-modules": [
        "error",
        {
          allow: ["@/components", "@/components/kit/**"],
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "@/features/**", // no cross-feature via alias
            "@/components/vendor/**", // never touch vendor
            "@/styles/**", // never touch styles direct
          ],
        },
      ],
    },
  },

  // Styles layer - allow clsx/tailwind-merge and literal classes
  {
    files: ["src/styles/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../**"],
              message: "Do not import from parent directories. Use aliases.",
            },
            // Remove clsx/tailwind-merge path restrictions for styles layer
            // Remove @/components/ui/* restriction for styles layer
          ],
          // No paths restrictions - allow clsx and tailwind-merge here
        },
      ],
      // Allow literal classes inside styling API factories
      "no-literal-classnames/no-literal-classnames": "off",
      "no-restricted-syntax": "off",
    },
  },

  // Vendor layer - allow clsx/tailwind-merge and literal classes, no repo imports
  {
    files: ["src/components/vendor/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": "off",
      "no-literal-classnames/no-literal-classnames": "off",
      "no-restricted-syntax": "off",
    },
  },

  // Kit layer - allow vendor imports but no literal classes (CVA outputs only)
  {
    files: ["src/components/kit/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../**"],
              message: "Do not import from parent directories. Use aliases.",
            },
          ],
          paths: [
            {
              name: "clsx",
              message:
                "Only allowed in src/styles/** and src/components/vendor/** - use styling API from @/styles/ui instead",
            },
            {
              name: "tailwind-merge",
              message:
                "Only allowed in src/styles/** and src/components/vendor/** - use styling API from @/styles/ui instead",
            },
          ],
        },
      ],
      // Kit uses CVA outputs only - no literal classes allowed
    },
  },

  // Kit components must be PascalCase
  {
    files: ["src/components/kit/**/*.{ts,tsx}"],
    rules: {
      "unicorn/filename-case": ["error", { cases: { pascalCase: true } }],
      "import/no-default-export": "error",
    },
  },

  // Helpers not TSX may be camelCase
  {
    files: ["src/components/**/*.ts"],
    ignores: ["**/*.tsx"],
    rules: {
      "unicorn/filename-case": ["error", { cases: { camelCase: true } }],
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
      "tsdoc/syntax": "off",
      "no-inline-comments": "off",
    },
  },

  // Next.js font file overrides
  {
    files: ["src/**/font*.{ts,tsx}"],
    rules: {
      "no-inline-styles/no-inline-styles": "off",
    },
  },

  // Documentation template overrides - disable TSDoc rules for example files
  {
    files: ["docs/templates/**/*.{ts,tsx}"],
    rules: {
      "tsdoc/syntax": "off",
      "jsdoc/*": "off",
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
    ],
  },
];
