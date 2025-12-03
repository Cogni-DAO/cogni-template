// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@eslint/ui-governance.config.mjs`
 * Purpose: Enforce token-driven Tailwind usage and layer-specific import discipline.
 * Scope: UI surfaces only (app, components, features) with custom governance rules.
 * Invariants: Only ui-governance/*, tailwindcss/*, and no-inline-styles/* rules active.
 * Side-effects: none
 * Notes: All TS/import/React/boundaries rules handled by Biome or other tools.
 * Links: docs/ARCHITECTURE.md#styling-invariants, docs/ui-style-spec.json
 * @public
 */

import communityTailwind from "@poupe/eslint-plugin-tailwindcss";
import noInlineStyles from "eslint-plugin-no-inline-styles";
import uiGovernance from "../scripts/eslint/plugins/ui-governance.cjs";

// Base restricted import patterns (DRY) - applies to all layers
// Note: Vendor imports (@/components/vendor/**) are restricted per-layer in app/features, not here.
// This allows kit/ to import vendor/ for wrapping primitives.
const BASE_RESTRICTED_PATTERNS = [
  {
    group: ["../**"],
    message: "Do not import from parent directories. Use aliases.",
  },
];

/** @type {import('eslint').Linter.Config[]} */
export default [
  // ========================================
  // CUSTOM UI GOVERNANCE RULES (All UI surfaces)
  // ========================================
  // NOTE: src/styles/** and src/theme/** excluded - they're definition files with separate rules (see lines 107-223)
  {
    files: [
      "src/app/**/*.{ts,tsx}",
      "src/components/**/*.{ts,tsx}",
      "src/features/**/*.{ts,tsx}",
    ],
    plugins: {
      "ui-governance": uiGovernance,
      tailwindcss: communityTailwind,
      "no-inline-styles": noInlineStyles,
    },
    settings: {
      tailwindcss: {
        callees: ["clsx", "cn", "classnames"],
      },
    },
    rules: {
      // Custom token enforcement rules
      "ui-governance/no-raw-colors": "error",
      "ui-governance/no-arbitrary-non-token-values": "error",
      "ui-governance/token-classname-patterns": "error",
      "ui-governance/no-vendor-imports-outside-kit": "error",

      // Tailwind community plugin rules
      "tailwindcss/no-conflicting-utilities": "error",
      "tailwindcss/no-arbitrary-value-overuse": [
        "error",
        {
          maxPerFile: 10,
          maxPerRule: 3,
          allowedUtilities: [
            "rounded-[var(--radius)]",
            "shadow-[var(--shadow)]",
          ],
        },
      ],
      // Disabled: creates noise with var(--token) patterns (reports them as non-theme values).
      // Real enforcement via ui-governance/* rules (lines 55-58) + scripts/check-ui-tokens.sh.
      // See docs/UI_CLEANUP_PLAN.md Phase 0 for token compliance architecture.
      "tailwindcss/prefer-theme-tokens": "off",
      "tailwindcss/valid-theme-function": "error",
      "tailwindcss/valid-apply-directive": "error",

      // No inline styles
      "no-inline-styles/no-inline-styles": "error",

      // Block parent-relative imports and restricted paths
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...BASE_RESTRICTED_PATTERNS,
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
    },
  },

  // ========================================
  // EXEMPTIONS: Vendor and styles layers
  // ========================================
  {
    files: ["src/components/vendor/**/*.{ts,tsx}", "src/styles/**/*.{ts,tsx}"],
    rules: {
      "ui-governance/no-raw-colors": "off",
      "ui-governance/no-arbitrary-non-token-values": "off",
      "ui-governance/token-classname-patterns": "off",
      "ui-governance/no-vendor-imports-outside-kit": "off",
      "no-restricted-imports": "off",
      "no-restricted-syntax": "off",
    },
  },

  // ========================================
  // FREEZE RULES: Block new components and UI library imports during cleanup
  // ========================================

  // Block new component files outside kit/ during cleanup phase
  {
    files: ["src/components/**/*.{ts,tsx}"],
    ignores: [
      "src/components/kit/**",
      "src/components/vendor/**",
      "src/components/index.ts",
      "src/components/AGENTS.md",
      "src/components/__arch_probes__/**",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Program",
          message:
            "New components must be added to kit/ or vendor/ during UI cleanup. See docs/UI_CLEANUP_PLAN.md Phase 0.",
        },
      ],
    },
  },

  // Block new UI library imports during cleanup phase
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@headlessui/*", "react-aria/*", "react-aria-components"],
              message:
                "New UI library imports blocked during cleanup. Use existing kit components. See docs/UI_CLEANUP_PLAN.md Phase 0.",
            },
          ],
        },
      ],
    },
  },

  // ========================================
  // LAYER-SPECIFIC RESTRICTIONS
  // ========================================

  // Features layer: block adapter/vendor/styles, allow same-feature imports
  // Note: Cross-feature boundaries enforced by depcruiser (ARCHITECTURE_ENFORCEMENT_GAPS.md)
  {
    files: ["src/features/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            // Removed: "@/features/**" - too broad, blocks same-feature imports
            // TODO: Add custom rule to block cross-feature only (e.g., ai/** cannot import payments/**)
            "@/components/vendor/**", // never touch vendor
            "@/styles/**", // never touch styles direct
            "@/adapters/**", // features may not import adapters
            "@/bootstrap/**", // features may not import bootstrap
            "@/core/**", // forces use of "@/core" only
          ],
        },
      ],
    },
  },

  // App layer: block direct adapter imports and vendor imports
  {
    files: ["src/app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "@/adapters/**", // app must not import adapters directly
            "@/components/vendor/**", // app must use kit wrappers, not vendor
          ],
        },
      ],
    },
  },

  // Styles layer: enforce CVA variant discipline
  {
    files: ["src/styles/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [...BASE_RESTRICTED_PATTERNS],
        },
      ],
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

  // Kit layer: enforce tailwind-merge restrictions
  {
    files: ["src/components/kit/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [...BASE_RESTRICTED_PATTERNS],
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

  // Shared cn utility: allow tailwind-merge
  {
    files: ["src/shared/util/cn.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },

  // ========================================
  // SPECIFIC FILE EXEMPTIONS
  // ========================================

  // Layout.tsx: allow global Tailwind CSS import
  {
    files: ["src/app/layout.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...BASE_RESTRICTED_PATTERNS,
            // NOTE: NO "@/styles/tailwind.css" pattern here - layout.tsx can import it
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

  // Next.js font files: allow inline styles
  {
    files: ["src/**/font*.{ts,tsx}"],
    rules: {
      "no-inline-styles/no-inline-styles": "off",
    },
  },

  // ========================================
  // THEME SAFETY: Block document.documentElement (broad scope)
  // ========================================
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "document",
          property: "documentElement",
          message:
            "Theme and <html> class mutations must go through ThemeProvider / ModeToggle.",
        },
      ],
    },
  },

  // Theme initialization script: allow document.documentElement
  {
    files: ["public/theme-init.js"],
    rules: {
      "no-restricted-properties": "off",
    },
  },

  // E2E tests: allow document.documentElement for theme testing
  {
    files: ["e2e/**/*.ts"],
    rules: {
      "no-restricted-properties": "off",
    },
  },
];
