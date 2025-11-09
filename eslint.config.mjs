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
import checkFile from "eslint-plugin-check-file";

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
      "check-file": checkFile,
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
            {
              group: ["@/styles/tailwind.css"],
              message:
                "Only src/app/layout.tsx may import global Tailwind CSS. Use @/styles/ui elsewhere.",
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
              allow: ["ui.ts", "tailwind.css"],
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
      // Ban inline variant maps inside cva(...) so authors must use typed `*Variants` consts
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.name='cva'] ObjectExpression > Property[key.name='variants'] ObjectExpression > Property > ObjectExpression",
          message:
            "Define variant maps in a `const *Variants` with `satisfies Record<…Key,string>` and pass the identifier.",
        },
      ],
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
      // Kit components must not use className at all - expose CVA variants instead
      "no-restricted-syntax": [
        "error",
        {
          selector: "Identifier[name='className']",
          message:
            "Kit components must not use `className`; expose CVA variants instead.",
        },
      ],
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

  // Global filename linting rules
  {
    files: ["**/*"],
    plugins: {
      "check-file": checkFile,
    },
    rules: {
      // Global barrel ban
      "check-file/no-index": "error",
    },
  },

  // Allowlist for specific barrel files
  {
    files: [
      "src/components/**/index.ts",
      "src/shared/**/index.ts",
      "src/features/*/index.ts",
      "src/styles/**/index.ts",
      "tests/_fakes/index.ts",
    ],
    plugins: {
      "check-file": checkFile,
    },
    rules: {
      "check-file/no-index": "off",
    },
  },

  // Global config exclusions
  {
    files: [
      "*.config.*",
      "*.rc.*",
      "*.env.*",
      ".eslintrc.*",
      ".prettierrc.*",
      ".stylelintrc.*",
      "jest.config.*",
      "drizzle.config.*",
      "next-env.d.ts",
      "next.config.*",
      "middleware.ts",
    ],
    plugins: {
      "check-file": checkFile,
      unicorn: unicorn,
    },
    rules: {
      "unicorn/filename-case": "off",
      "check-file/filename-naming-convention": "off",
      "check-file/no-index": "off",
    },
  },

  // Vendor components exclusion
  {
    files: ["src/components/vendor/**/*"],
    plugins: {
      "check-file": checkFile,
      unicorn: unicorn,
    },
    rules: {
      "unicorn/filename-case": "off",
      "check-file/filename-naming-convention": "off",
      "import/no-default-export": "off",
    },
  },

  // Components: PascalCase.tsx with optional client/server suffixes
  {
    files: ["src/components/**/*.tsx", "src/features/*/components/**/*.tsx"],
    ignores: ["src/components/vendor/**/*"],
    plugins: {
      "check-file": checkFile,
      unicorn: unicorn,
      import: importPlugin,
    },
    rules: {
      "unicorn/filename-case": [
        "error",
        {
          cases: { pascalCase: true },
          ignore: ["\\.(client|server)\\.tsx$"],
        },
      ],
      "check-file/filename-naming-convention": [
        "error",
        {
          "*.tsx": "PASCAL_CASE",
        },
        {
          ignoreMiddleExtensions: true,
        },
      ],
      "import/no-default-export": "error",
    },
  },

  // Component helpers: camelCase.ts
  {
    files: ["src/components/**/*.ts", "src/features/*/components/**/*.ts"],
    ignores: ["**/*.tsx", "**/index.ts"],
    plugins: {
      "check-file": checkFile,
      unicorn: unicorn,
    },
    rules: {
      "unicorn/filename-case": ["error", { cases: { camelCase: true } }],
      "check-file/filename-naming-convention": [
        "error",
        {
          "*.ts": "CAMEL_CASE",
        },
      ],
    },
  },

  // Hooks: useName.ts|tsx pattern
  {
    files: ["**/hooks/**/*.{ts,tsx}"],
    plugins: {
      "check-file": checkFile,
    },
    rules: {
      "check-file/filename-naming-convention": [
        "error",
        {
          "*.{ts,tsx}": "^use[A-Z][a-zA-Z0-9]*$",
        },
      ],
    },
  },

  // Ban test/story files in hooks (prevent drift)
  {
    files: ["**/hooks/**/*.{test,spec,stories}.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Program",
          message:
            "Tests/stories not allowed in hooks/ - use /tests/** for hook tests",
        },
      ],
    },
  },

  // Next.js App Router whitelist
  {
    files: ["src/app/**/*"],
    plugins: {
      "check-file": checkFile,
    },
    rules: {
      "check-file/filename-naming-convention": [
        "error",
        {
          "*.tsx":
            "^(page|layout|error|loading|not-found|template|default|providers)$",
          "*.ts": "^(route|sitemap|robots)$",
          "*.css": "KEBAB_CASE",
        },
      ],
      "check-file/no-index": "error",
    },
  },

  // Hexagonal layer suffixes
  {
    files: ["src/ports/**/*.ts"],
    plugins: {
      "check-file": checkFile,
    },
    rules: {
      "check-file/filename-naming-convention": [
        "error",
        {
          "*.ts": "+([a-z])+(([A-Z])*([a-z0-9]))*(.port)",
        },
      ],
    },
  },

  {
    files: ["src/adapters/**/*.ts"],
    plugins: {
      "check-file": checkFile,
    },
    rules: {
      "check-file/filename-naming-convention": [
        "error",
        {
          "*.ts": "+([a-z])+(([A-Z])*([a-z0-9]))*(.(adapter|repo|client))",
        },
      ],
    },
  },

  {
    files: ["src/contracts/**/*.ts"],
    plugins: {
      "check-file": checkFile,
    },
    rules: {
      "check-file/filename-naming-convention": [
        "error",
        {
          "*.ts": "+([a-z])+(([A-Z])*([a-z0-9]))*(.contract)",
        },
      ],
    },
  },

  {
    files: ["src/shared/schemas/**/*.ts"],
    plugins: {
      "check-file": checkFile,
    },
    rules: {
      "check-file/filename-naming-convention": [
        "error",
        {
          "*.ts": "+([a-z])+(([A-Z])*([a-z0-9]))*(.schema)",
        },
      ],
    },
  },

  {
    files: ["src/shared/**/mappers/**/*.ts"],
    plugins: {
      "check-file": checkFile,
    },
    rules: {
      "check-file/filename-naming-convention": [
        "error",
        {
          "*.ts": "+([a-z])+(([A-Z])*([a-z0-9]))*(.mapper)",
        },
      ],
    },
  },

  // Feature slice root files
  {
    files: ["src/features/**/*.{ts,tsx}"],
    ignores: ["**/services/**", "**/components/**", "**/hooks/**"],
    plugins: {
      "check-file": checkFile,
    },
    rules: {
      "check-file/filename-naming-convention": [
        "error",
        {
          "*.ts": "^(actions|types|constants|index)$",
        },
      ],
    },
  },

  // Feature utils ban
  {
    files: ["src/features/**/utils.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Program",
          message:
            "utils.ts banned in features - use services/ or move to shared/",
        },
      ],
    },
  },

  // Feature services: camelCase
  {
    files: ["src/features/*/services/**/*.ts"],
    plugins: {
      unicorn: unicorn,
    },
    rules: {
      "unicorn/filename-case": ["error", { cases: { camelCase: true } }],
    },
  },

  // Tests patterns
  {
    files: ["tests/**/*.{ts,tsx}"],
    plugins: {
      "check-file": checkFile,
    },
    rules: {
      "check-file/filename-naming-convention": [
        "error",
        {
          "*.{ts,tsx}":
            "^([a-z][a-zA-Z0-9]*)(\\.(test|spec)|\\.int\\.test|\\.contract\\.test)$|^([a-z][a-zA-Z0-9]*)\\.spec$|^(use[A-Z][a-zA-Z0-9]*)(\\.(test|spec))$",
        },
      ],
    },
  },

  // Scripts: kebab-case with extensions
  {
    files: ["scripts/**/*"],
    plugins: {
      "check-file": checkFile,
      unicorn: unicorn,
    },
    rules: {
      "unicorn/filename-case": ["error", { cases: { kebabCase: true } }],
      "check-file/filename-naming-convention": [
        "error",
        {
          "*.{ts,mjs,cjs,sh,sql}": "KEBAB_CASE",
        },
      ],
    },
  },

  // Styles: kebab-case .ts and .css
  {
    files: ["src/styles/**/*"],
    plugins: {
      "check-file": checkFile,
      unicorn: unicorn,
    },
    rules: {
      "unicorn/filename-case": ["error", { cases: { kebabCase: true } }],
      "check-file/filename-naming-convention": [
        "error",
        {
          "*.ts": "KEBAB_CASE",
          "*.css": "KEBAB_CASE",
        },
      ],
    },
  },

  // Types: enforce .d.ts in src/types/** only
  {
    files: ["src/types/**/*.d.ts"],
    plugins: {
      "check-file": checkFile,
    },
    rules: {
      "check-file/filename-naming-convention": [
        "error",
        {
          "*.d.ts": "CAMEL_CASE",
        },
      ],
    },
  },

  // Ban .d.ts outside src/types/**
  {
    files: ["src/**/*.d.ts"],
    ignores: ["src/types/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Program",
          message: "*.d.ts files must be in src/types/** only",
        },
      ],
    },
  },

  // Shared utilities: camelCase
  {
    files: ["src/shared/util/**/*.ts"],
    plugins: {
      "check-file": checkFile,
      unicorn: unicorn,
    },
    rules: {
      "unicorn/filename-case": ["error", { cases: { camelCase: true } }],
      "check-file/filename-naming-convention": [
        "error",
        {
          "*.ts": "CAMEL_CASE",
        },
      ],
    },
  },

  // Allow layout.tsx to import global Tailwind CSS
  {
    files: ["src/app/layout.tsx"],
    rules: {
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
            // note: NO "@/styles/tailwind.css" pattern here
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
      "**/.env*",
    ],
  },
];
