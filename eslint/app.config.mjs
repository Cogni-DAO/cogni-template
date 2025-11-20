import nextPlugin from "@next/eslint-plugin-next";
import communityTailwind from "@poupe/eslint-plugin-tailwindcss";
import boundaries from "eslint-plugin-boundaries";
import importPlugin from "eslint-plugin-import";
import jsxA11y from "eslint-plugin-jsx-a11y";
import noInlineStyles from "eslint-plugin-no-inline-styles";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

/** @type {import('eslint').Linter.Config[]} */
export default [
  // Main TypeScript app files with all framework rules
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      "@next/next": nextPlugin,
      tailwindcss: communityTailwind,
      "no-inline-styles": noInlineStyles,
      import: importPlugin,
      boundaries: boundaries,
      "jsx-a11y": jsxA11y,
      react: react,
      "react-hooks": reactHooks,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,

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
              name: "tailwind-merge",
              message:
                "Only allowed in src/styles/** and src/components/vendor/** - use styling API from @/styles/ui instead",
            },
          ],
        },
      ],

      // Block direct document.documentElement manipulation to enforce ThemeProvider usage
      "no-restricted-properties": [
        "error",
        {
          object: "document",
          property: "documentElement",
          message:
            "Theme and <html> class mutations must go through ThemeProvider / ModeToggle.",
        },
      ],

      // React rules
      "react/react-in-jsx-scope": "off",

      // React hooks rules
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // Accessibility rules (standardized core set)
      ...jsxA11y.configs.recommended.rules,
      "jsx-a11y/alt-text": "error",
      "jsx-a11y/anchor-is-valid": "error",
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/aria-proptypes": "error",
      "jsx-a11y/aria-role": "error",
      "jsx-a11y/aria-unsupported-elements": "error",
      "jsx-a11y/click-events-have-key-events": "error",
      "jsx-a11y/interactive-supports-focus": "error",
      "jsx-a11y/label-has-associated-control": "error",
      "jsx-a11y/no-autofocus": "warn",
      "jsx-a11y/no-static-element-interactions": "warn",

      // Tailwind rules (community plugin has different rule names)
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

      // No inline styles
      "no-inline-styles/no-inline-styles": "error",

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
              disallow: ["adapters/test/**"],
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
                "bootstrap/**",
              ],
              disallow: ["adapters/test/**"],
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
            {
              from: "adapters/test",
              allow: ["adapters/test/**", "ports/**", "shared/**", "types/**"],
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
                "adapters/test",
                "shared",
                "components",
              ],
              allow: ["**/index.ts", "**/index.tsx"],
            },
            {
              target: ["contracts"],
              allow: [
                "**/*.contract.ts",
                "http/router.v1.ts",
                "http/openapi.v1.ts",
              ],
            },
            {
              target: ["styles"],
              allow: ["ui.ts", "tailwind.css"],
            },
            {
              target: ["features"],
              allow: [
                "**/services/*.{ts,tsx}",
                "**/components/*.{ts,tsx}",
                "**/public.ts",
              ],
            },
            {
              target: ["core"],
              allow: ["**/public.ts"],
            },
            {
              target: ["bootstrap"],
              allow: ["container.ts"],
            },
            {
              target: ["app"],
              allow: ["**/*.{ts,tsx}", "_facades/**/*.server.ts"],
            },
          ],
        },
      ],
    },
    settings: {
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
        "playwright.config.ts",
        "commitlint.config.cjs",
        "drizzle.config.ts",
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
        { type: "adapters/test", pattern: "src/adapters/test/**" },
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
          allow: [
            "@/components",
            "@/components/kit/**",
            "@/core", // alias -> src/core/public.ts
            "@/ports", // alias -> src/ports/index.ts
            "@/shared",
            "services/*", // allow internal service imports within a feature
            "errors", // allow internal error imports within a feature
          ],
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "@/features/**", // no cross-feature via alias
            "@/components/vendor/**", // never touch vendor
            "@/styles/**", // never touch styles direct
            "@/adapters/**", // features may not import adapters
            "@/bootstrap/**", // features may not import bootstrap
            "@/core/**", // forces use of "@/core" only
          ],
        },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports" },
      ],
    },
  },

  // App layer: block direct adapter imports (bootstrap is the only ingress)
  {
    files: ["src/app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "@/adapters/**", // app must not import adapters directly
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
              name: "tailwind-merge",
              message:
                "Only allowed in src/styles/** and src/components/vendor/** - use styling API from @/styles/ui instead",
            },
          ],
        },
      ],
    },
  },

  // Shared cn utility may import tailwind-merge for reuse
  {
    files: ["src/shared/util/cn.ts"],
    rules: {
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

  // Theme initialization script override - allow document.documentElement access
  {
    files: ["public/theme-init.js"],
    rules: {
      "no-restricted-properties": "off",
    },
  },

  // E2E tests override - allow document.documentElement access for theme testing
  {
    files: ["e2e/**/*.{ts,spec.ts}"],
    rules: {
      "no-restricted-properties": "off",
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
              name: "tailwind-merge",
              message:
                "Only allowed in src/styles/** and src/components/vendor/** - use styling API from @/styles/ui instead",
            },
          ],
        },
      ],
    },
  },
];
