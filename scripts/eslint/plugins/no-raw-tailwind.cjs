// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@scripts/eslint/plugins/no-raw-tailwind`
 * Purpose: ESLint rule that enforces design token usage over raw Tailwind utility classes.
 * Scope: Detects ALL value-bearing Tailwind utilities and enforces tokenization. Per-token scanning catches current and future violations.
 * Invariants: All value-bearing utilities must use semantic names or -[var(--token)] format; structural utilities allowed raw.
 * Side-effects: none
 * Notes: Token-based scanning replaces string-level matching for comprehensive coverage.
 * Links: eslint/no-raw-tailwind.config.mjs, src/styles/theme.ts, src/styles/tailwind.css
 * @public
 */

// ALLOWED_VAR: Token reference pattern - any utility with var(--token) format
const ALLOWED_VAR =
  /^[a-z0-9-]+-\[(?:var\(--[a-z0-9-]+\)|hsl\(var\(--[a-z0-9-]+\)\))\]$/i;

// ALLOWED_SEMANTIC_COLOR: Semantic color tokens for color-related utilities
const ALLOWED_SEMANTIC_COLOR =
  /^(bg|text|border|from|to|via|fill|stroke|ring|ring-offset)-(background|foreground|card|popover|primary|secondary|muted|accent|destructive|border|input|ring|chart-[1-5])(-foreground)?$/;

// ALLOWED_CHART_TOKENS: Chart color tokens as standalone values
const ALLOWED_CHART_TOKENS = /^chart-[1-5]$/;

// ALLOWED_SEMANTIC_SIZE: Semantic size tokens for sizing utilities
const ALLOWED_SEMANTIC_SIZE =
  /^(h|w|gap|rounded|rounded-t|rounded-r|rounded-b|rounded-l|rounded-tl|rounded-tr|rounded-br|rounded-bl)-(none|sm|md|lg|xl|full)$/;

// ALLOWED_STRUCTURAL: Structural selectors and utilities that should be allowed
const ALLOWED_STRUCTURAL = /^(has-\[>svg\]|text-transparent)$/;

// ALLOWED_SEMANTIC_TEXT: Tailwind text scale + typography prose utilities
const ALLOWED_SEMANTIC_TEXT =
  /^(text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl)|prose-(sm|base|lg|xl)|text-transparent)$/;

// RAW_COLOR_SUFFIX: named palette or basic colors => must be tokenized
const RAW_COLOR_SUFFIX =
  /^(black|white|transparent|current|(red|rose|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|slate|gray|zinc|neutral|stone)(-[0-9]{2,3})?)$/;

// SCALE_SUFFIX: any numeric / fraction / scale-ish suffix
const SCALE_SUFFIX = /(\d|[0-9]+\/[0-9]+|xs|sm|base|lg|xl|[2-9]xl)$/;

/**
 * Check individual Tailwind class token for violations
 * @param {string} token - Single Tailwind class (e.g., "bg-red-500", "h-4")
 * @returns {string | null} - Error message or null if valid
 */
function checkClassToken(token) {
  const original = token;

  // Ignore structural utilities with no '-' at all (e.g. "flex", "grid")
  if (!original.includes("-")) return null;

  // Handle negative utilities: -translate-y-2, -mt-4, etc.
  const negativeStripped = original.startsWith("-")
    ? original.slice(1)
    : original;
  const t = negativeStripped;

  // Allow tokenized variants: prefix-[var(--token)]
  if (ALLOWED_VAR.test(t)) return null;

  // Allow semantic utilities first
  if (ALLOWED_SEMANTIC_COLOR.test(t)) return null;
  if (ALLOWED_SEMANTIC_SIZE.test(t)) return null;
  if (ALLOWED_SEMANTIC_TEXT.test(t)) return null;
  if (ALLOWED_STRUCTURAL.test(t)) return null;
  if (ALLOWED_CHART_TOKENS.test(t)) return null;

  // Split into prefix + suffix (first dash only)
  const match = t.match(/^([a-z0-9-]+)-(.*)$/i);
  if (!match) return null;

  const suffix = match[2];

  // Arbitrary values must be tokenized: prefix-[...]
  if (suffix.startsWith("[")) {
    if (!ALLOWED_VAR.test(t)) {
      return `Raw Tailwind value "${original}" is not allowed. Use a tokenized variant (prefix-[var(--token)]) or a semantic utility.`;
    }
    return null;
  }

  // Raw palette suffixes or scale-like suffixes must be tokenized or semantic
  if (RAW_COLOR_SUFFIX.test(suffix) || SCALE_SUFFIX.test(suffix)) {
    return `Raw Tailwind value "${original}" is not allowed. Use a tokenized variant (prefix-[var(--token)]) or a semantic utility.`;
  }

  // Anything else: treated as structural or semantic we don't care about
  return null;
}

/**
 * Check text for raw Tailwind violations by scanning individual tokens
 * @param {string} text - Text content to check
 * @returns {string | null} - Error message or null if valid
 */
function checkText(text) {
  const rawTokens = text.split(/\s+/);

  for (const rawToken of rawTokens) {
    if (!rawToken) continue;

    // Split variant chains: hover:bg-red-500 -> ["hover", "bg-red-500"]
    const segments = rawToken.split(":");

    for (const segment of segments) {
      if (!segment) continue;
      const error = checkClassToken(segment);
      if (error) return error;
    }
  }

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
