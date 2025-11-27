import checkFile from "eslint-plugin-check-file";
import importPlugin from "eslint-plugin-import";
import unicorn from "eslint-plugin-unicorn";

/** @type {import('eslint').Linter.Config[]} */
export default [
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
      "src/ports/index.ts",
      "src/adapters/server/index.ts",
      "src/adapters/test/index.ts",
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

  // Kit components must be PascalCase
  {
    files: ["src/components/kit/**/*.{ts,tsx}"],
    rules: {
      "unicorn/filename-case": ["error", { cases: { pascalCase: true } }],
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
];
