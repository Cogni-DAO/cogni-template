// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@scripts/eslint/plugins/no-raw-tailwind`
 * Purpose: ESLint rule that enforces design token usage over raw Tailwind utility classes.
 * Scope: Detects raw palette/numeric Tailwind classes and suggests token alternatives. Does not validate CSS syntax or React components.
 * Invariants: Flags raw color/size utilities; allows semantic tokens and CSS variables; reports helpful error messages.
 * Side-effects: none
 * Notes: Uses regex patterns to detect forbidden vs allowed Tailwind class patterns.
 * Links: eslint/no-raw-tailwind.config.mjs, src/styles/theme.ts
 * @public
 */

/** ESLint rule: no-raw-tailwind-classes */
const CLASS_RE =
  /\b(bg|text|border|from|to|via|fill|stroke|h|w|p|m|gap|rounded)-(?!\[)/;
const FORBIDDEN =
  /\b(bg|text|border|from|to|via|fill|stroke)-(red|rose|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|slate|gray|zinc|neutral|stone)(-\d{2,3})?\b|\b(h|w|p|m|gap|rounded)-\d+\b/;

const ALLOWED_VAR =
  /\b(bg|text|border|from|to|via|fill|stroke)-\[(?:hsl\(var\(--color-[^)]+\)|var\(--(size|radius|spacing)-[^)]+\))\]/;

const ALLOWED_SEMANTIC =
  /\b(bg|text|border|from|to|via|fill|stroke)-(background|foreground|card|popover|primary|secondary|muted|accent|destructive|border|input|ring|chart-[1-5])(-foreground)?\b|\b(h|w|gap|rounded)-(none|sm|md|lg|xl|full)\b/;

/**
 * @param {string} s
 * @returns {string | null}
 */
function checkText(s) {
  if (!CLASS_RE.test(s)) return null; // not class-like
  if (ALLOWED_VAR.test(s)) return null; // token via var(...)
  if (ALLOWED_SEMANTIC.test(s)) return null; // semantic utilities
  if (FORBIDDEN.test(s))
    return "Use tokens: var(--...) or semantic utilities. No raw palette or numeric utilities.";
  return null;
}

module.exports = {
  rules: {
    "no-raw-tailwind-classes": {
      meta: {
        type: "problem",
        docs: {
          description: "Enforce tokenized Tailwind classes",
          category: "Best Practices",
          recommended: true,
        },
        schema: [],
      },
      /**
       * @param {any} context
       */
      create(context) {
        /**
         * @param {any} node
         * @param {string} text
         */
        function reportIfBad(node, text) {
          const msg = checkText(text);
          if (msg) context.report({ node, message: msg });
        }
        return {
          /**
           * @param {any} node
           */
          Literal(node) {
            if (typeof node.value === "string") reportIfBad(node, node.value);
          },
          /**
           * @param {any} node
           */
          TemplateElement(node) {
            reportIfBad(node, node.value.raw || "");
          },
        };
      },
    },
  },
};
