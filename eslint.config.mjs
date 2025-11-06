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

      // Tailwind rules (community plugin has different rule names)
      // TODO: restore official rules when switching back to official plugin
      // "tailwindcss/no-arbitrary-value": "error",
      // "tailwindcss/classnames-order": "off", // Prettier plugin handles order

      // No inline styles
      "no-inline-styles/no-inline-styles": "error",

      // Boundaries rules - disabled for now since no features/entities structure exists yet
      // "boundaries/entry-point": [
      //   "error",
      //   {
      //     default: "disallow",
      //     rules: [
      //       {
      //         target: ["shared"],
      //         allow: ["**"],
      //       },
      //       {
      //         target: ["entities"],
      //         allow: ["shared", "entities"],
      //       },
      //       {
      //         target: ["features"],
      //         allow: ["shared", "entities", "features"],
      //       },
      //       {
      //         target: ["app"],
      //         allow: ["**"],
      //       },
      //     ],
      //   },
      // ],
    },
    settings: {
      tailwindcss: {
        config: "tailwind.config.ts",
        callees: ["clsx", "cn", "classnames"],
      },
      // boundaries: {
      //   elements: [
      //     { type: "app", pattern: "app/*" },
      //     { type: "features", pattern: "features/*" },
      //     { type: "entities", pattern: "entities/*" },
      //     { type: "shared", pattern: "shared/*" },
      //   ],
      // },
    },
  },

  // Test file overrides
  {
    files: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: {
      "boundaries/entry-point": "off",
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
