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

// VALUE_PREFIX: Comprehensive list of all value-bearing Tailwind utility prefixes
// These utilities carry values (colors, sizes, spacing, etc.) and must be tokenized
const VALUE_PREFIX =
  /^(bg|text|border|from|to|via|fill|stroke|ring|ring-offset|h|min-h|max-h|w|min-w|max-w|size|p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|space-x|space-y|rounded|rounded-t|rounded-r|rounded-b|rounded-l|rounded-tl|rounded-tr|rounded-br|rounded-bl|top|right|bottom|left|inset|inset-x|inset-y|z|opacity|duration|delay|scale|scale-x|scale-y|rotate|translate-x|translate-y|leading|tracking)-/;

// ALLOWED_VAR: Generalized token reference pattern - any utility with var(--token) format
const ALLOWED_VAR =
  /^[a-z0-9-]+-\[(?:var\(--[a-z0-9-]+\)|hsl\(var\(--[a-z0-9-]+\)\))\]$/i;

// ALLOWED_SEMANTIC_COLOR: Semantic color tokens for color-related utilities
const ALLOWED_SEMANTIC_COLOR =
  /^(bg|text|border|from|to|via|fill|stroke|ring)-(background|foreground|card|popover|primary|secondary|muted|accent|destructive|border|input|ring|chart-[1-5])(-foreground)?$/;

// ALLOWED_SEMANTIC_SIZE: Semantic size tokens for sizing utilities
const ALLOWED_SEMANTIC_SIZE =
  /^(h|w|gap|rounded|rounded-t|rounded-r|rounded-b|rounded-l|rounded-tl|rounded-tr|rounded-br|rounded-bl)-(none|sm|md|lg|xl|full)$/;

// SCALE_SUFFIX: Detects raw scale values that should be tokenized
// Catches numeric scales, fractions, and named scales (xs, sm, lg, xl, 2xl, etc.)
const SCALE_SUFFIX = /^(?:\d.*|[0-9]+\/[0-9]+|xs|sm|base|lg|xl|[2-9]xl)$/;

/**
 * Check individual Tailwind class token for violations
 * @param {string} token - Single Tailwind class (e.g., "bg-red-500", "h-4")
 * @returns {string | null} - Error message or null if valid
 */
function checkClassToken(token) {
  // Skip non-value-bearing utilities (structural classes like flex, grid, etc.)
  if (!VALUE_PREFIX.test(token)) return null;

  // Allow tokenized variants: prefix-[var(--token)]
  if (ALLOWED_VAR.test(token)) return null;

  // Allow semantic color utilities
  if (ALLOWED_SEMANTIC_COLOR.test(token)) return null;

  // Allow semantic size utilities
  if (ALLOWED_SEMANTIC_SIZE.test(token)) return null;

  // Extract suffix after the prefix
  const match = token.match(/^[a-z0-9-]+-(.+)$/);
  if (!match) return null;

  const suffix = match[1];

  // Flag bracket notation that's not a token reference
  if (suffix.startsWith("[") && !ALLOWED_VAR.test(token)) {
    return `Raw Tailwind value "${token}" is not allowed. Use a tokenized variant (prefix-[var(--token)]) or a semantic utility.`;
  }

  // Flag scale-based suffixes (numeric, named scales)
  if (SCALE_SUFFIX.test(suffix)) {
    return `Raw Tailwind value "${token}" is not allowed. Use a tokenized variant (prefix-[var(--token)]) or a semantic utility.`;
  }

  return null;
}

/**
 * Check text for raw Tailwind violations by scanning individual tokens
 * @param {string} text - Text content to check
 * @returns {string | null} - Error message or null if valid
 */
function checkText(text) {
  // Split text into potential class tokens and check each one
  const tokens = text.split(/\s+/);

  for (const token of tokens) {
    const error = checkClassToken(token);
    if (error) return error;
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
