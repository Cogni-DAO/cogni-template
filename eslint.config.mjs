import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import prettierConfig from "eslint-config-prettier";
import boundaries from "eslint-plugin-boundaries";
import noInlineStyles from "eslint-plugin-no-inline-styles";
// import tailwindPlugin from "eslint-plugin-tailwindcss"; // Disabled due to Tailwind v4 compatibility
import simpleImportSort from "eslint-plugin-simple-import-sort";

/** @type {import('eslint').Linter.Config[]} */
export default [
  js.configs.recommended,

  {
    files: ["**/*.{ts,tsx,js,mjs,cjs}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        projectService: {
          allowDefaultProject: ["*config*.mjs", "eslint.config.mjs"],
          defaultProject: "./tsconfig.eslint.json",
        },
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "@next/next": nextPlugin,
      // "tailwindcss": tailwindPlugin, // Disabled due to Tailwind v4 compatibility
      "simple-import-sort": simpleImportSort,
      "no-inline-styles": noInlineStyles,
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

      // Tailwind rules - disabled due to v4 compatibility
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
      // tailwindcss: {
      //   callees: ["clsx", "cn", "classnames"],
      //   config: "tailwind.config.ts"
      // },
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

  prettierConfig,

  {
    ignores: [
      ".next/**",
      "out/**",
      "dist/**",
      "coverage/**",
      "*.d.ts",
      "node_modules/**",
    ],
  },
];
