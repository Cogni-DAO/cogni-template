// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@scripts/eslint/plugins/no-raw-tailwind`
 * Purpose: ESLint rule that enforces design token usage over raw Tailwind utility classes.
 * Scope: Runtime CSS parsing validates bracketed vars against actual tokens; blocks raw palette/numeric utilities. Does not validate build-time compilation.
 * Invariants: Bracketed vars must reference existing CSS custom properties; structural utilities allowed raw.
 * Side-effects: IO (reads src/styles/tailwind.css once per lint run)
 * Notes: Self-contained rule with runtime token extraction - no build step required.
 * Links: eslint/no-raw-tailwind.config.mjs, src/styles/tailwind.css
 * @public
 */

const fs = require("node:fs");
const path = require("node:path");

// Per-path cache for parsed tokens
const tokenCache = new Map();

/**
 * Resolve CSS file path with support for test overrides
 * @param {any} context - ESLint rule context
 * @returns {string} - Absolute path to CSS file
 */
function resolveCssPath(context) {
  // 1) explicit option wins
  const optPath = context.options?.[0]?.cssPath || null;
  if (optPath) return path.resolve(optPath);

  // 2) env var for tests
  if (process.env.NO_RAW_TW_CSS) return path.resolve(process.env.NO_RAW_TW_CSS);

  // 3) default: project cwd
  return path.join(
    context.getCwd ? context.getCwd() : process.cwd(),
    "src/styles/tailwind.css"
  );
}

// BRACKETED_PATTERN: Generic pattern to find any bracketed utility
const BRACKETED_PATTERN = /^([a-z0-9-]+)-\[(.+)\]$/i;

// TOKEN_PATTERN: Extract all var(--token) references from bracketed content
const TOKEN_PATTERN = /var\(--([a-z0-9-]+)\)/gi;

// ALLOWED_STRUCTURAL: Only truly structural utilities (layout, display, position)
const ALLOWED_STRUCTURAL =
  /^(has-\[>svg\]|shrink-0|flex|grid|inline|block|hidden|relative|absolute|fixed|sticky|col-span-\d+)$/;

// ALLOWED_SEMANTIC_TEXT: Only semantic text scale utilities
const ALLOWED_SEMANTIC_TEXT =
  /^(text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl)|prose-(sm|base|lg|xl))$/;

// ALLOWED_SEMANTIC_SIZE: Only semantic size tokens
const ALLOWED_SEMANTIC_SIZE =
  /^(h|w|gap|rounded|rounded-t|rounded-r|rounded-b|rounded-l|rounded-tl|rounded-tr|rounded-br|rounded-bl)-(none|sm|md|lg|xl|full)$/;

// ALLOWED_KEYWORDS: CSS keywords for paint properties (transparent, current)
const ALLOWED_KEYWORDS =
  /^(bg|text|border|ring|stroke|fill|ring-offset)-(transparent|current)$/i;

// ALLOWED_ZERO: Zero-only structural utilities
const ALLOWED_ZERO =
  /^(?:m[trblxy]?|p[trblxy]?|gap|space-[xy]|inset|top|right|bottom|left|pt|mt|pr|mr|pb|mb|pl|ml)-0$/;

// HAS_SELECTOR: Selector utilities like has-[>svg]
const HAS_SELECTOR = /^has-\[.+\]$/;

// LAYOUT_MATH: Narrow layout math exception
const LAYOUT_MATH = /^(min|max)-w-\[min\(100%,\s*\d+ch\)\]$/;

// ALIAS_WITH_OPACITY: Semantic aliases with optional opacity
const ALIAS_WITH_OPACITY =
  /^(bg|text|border|ring|from|via|to|fill|stroke)-(primary|secondary|muted|accent|destructive|ring|foreground|background|card|popover|border|input)(\/\d{1,3}%?)?$/i;

// RAW_COLOR_SUFFIX: named palette or basic colors => must be tokenized
const RAW_COLOR_SUFFIX =
  /^(black|white|(red|rose|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|slate|gray|zinc|neutral|stone)(-[0-9]{2,3})?)$/;

// SCALE_SUFFIX: any numeric / fraction / scale-ish suffix
const SCALE_SUFFIX = /(\d|[0-9]+\/[0-9]+|xs|sm|base|lg|xl|[2-9]xl)$/;

/**
 * Extract CSS custom properties from tailwind.css content
 * @param {string} cssContent - CSS file content
 * @returns {Set<string>} - Set of token names (without -- prefix)
 */
function extractTokensFromCSS(cssContent) {
  const tokenPattern = /--([a-z0-9-]+)\s*:/gi;

  // Use matchAll to avoid lastIndex issues
  const tokens = new Set(
    [...cssContent.matchAll(tokenPattern)].map((m) => m[1])
  );

  return tokens;
}

/**
 * Get CSS tokens for a specific path, with caching
 * @param {string} cssPath - Path to CSS file
 * @returns {Set<string>} - Set of available CSS custom property names
 */
function getTokensForPath(cssPath) {
  if (tokenCache.has(cssPath)) {
    return tokenCache.get(cssPath);
  }

  try {
    const cssContent = fs.readFileSync(cssPath, "utf-8");
    const tokens = extractTokensFromCSS(cssContent);
    tokenCache.set(cssPath, tokens);
    return tokens;
  } catch {
    // Cache empty set to avoid repeated IO
    console.warn(
      `no-raw-tailwind: Could not read ${cssPath}, allowing all bracketed vars`
    );
    const empty = new Set();
    tokenCache.set(cssPath, empty);
    return empty;
  }
}

/**
 * Extract and validate tokens from bracketed content
 * @param {string} bracketContent - Content inside brackets
 * @param {Set<string>} cssTokens - Available CSS tokens
 * @param {string} cssPath - Path to CSS file for error messages
 * @returns {string | null} - Error message or null if valid
 */
function validateTokensInBrackets(bracketContent, cssTokens, cssPath) {
  // Extract all var(--token) references using matchAll to avoid lastIndex issues
  const tokens = [...bracketContent.matchAll(TOKEN_PATTERN)].map((m) => m[1]);

  // If no tokens found, this is a raw arbitrary value - block it
  if (tokens.length === 0) {
    return `Raw arbitrary value not allowed. Use bracketed tokens with var(--token) syntax.`;
  }

  // Validate all tokens exist in CSS (if we have token data)
  if (cssTokens.size > 0) {
    for (const tokenName of tokens) {
      if (!cssTokens.has(tokenName)) {
        return `Token "--${tokenName}" not found in ${cssPath}. Use an existing token or add it to the CSS.`;
      }
    }
  }

  return null; // All tokens valid
}

/**
 * Check individual Tailwind class token for violations
 * @param {string} token - Single Tailwind class (e.g., "bg-red-500", "h-4")
 * @param {Set<string>} cssTokens - Available CSS tokens
 * @param {string} cssPath - Path to CSS file for error messages
 * @returns {string | null} - Error message or null if valid
 */
function checkClassToken(token, cssTokens, cssPath) {
  const original = token;

  // Strip ! prefix and leading - for proper validation
  let t = original;
  if (t.startsWith("!")) t = t.slice(1);
  if (t.startsWith("-")) t = t.slice(1);

  // Ignore structural utilities with no '-' at all (e.g. "flex", "grid")
  if (!t.includes("-")) return null;

  // Check for selector utilities first (has-[>svg], etc.)
  if (HAS_SELECTOR.test(t)) return null;

  // Check for bracketed values: any-prefix-[content]
  const bracketedMatch = t.match(BRACKETED_PATTERN);
  if (bracketedMatch) {
    const bracketContent = bracketedMatch[2];
    const tokenError = validateTokensInBrackets(
      bracketContent,
      cssTokens,
      cssPath
    );
    if (tokenError) {
      return `${tokenError} In "${original}".`;
    }
    return null; // Valid bracketed usage with tokens
  }

  // Allow semantic utilities
  if (ALLOWED_SEMANTIC_SIZE.test(t)) return null;
  if (ALLOWED_SEMANTIC_TEXT.test(t)) return null;
  if (ALLOWED_STRUCTURAL.test(t)) return null;

  // Allow CSS keywords for paint properties
  if (ALLOWED_KEYWORDS.test(t)) return null;

  // Allow zero-only structural utilities
  if (ALLOWED_ZERO.test(t)) return null;

  // Allow narrow layout math
  if (LAYOUT_MATH.test(t)) return null;

  // Allow semantic aliases with optional opacity
  if (ALIAS_WITH_OPACITY.test(t)) return null;

  // Split into prefix + suffix for further analysis
  const match = t.match(/^([a-z0-9-]+)-(.*)$/i);
  if (!match) return null;

  const suffix = match[2];

  // Raw palette suffixes or scale-like suffixes must be tokenized
  if (RAW_COLOR_SUFFIX.test(suffix) || SCALE_SUFFIX.test(suffix)) {
    return `Raw Tailwind value "${original}" is not allowed. Use a bracketed token (prefix-[var(--token)]) or a semantic utility.`;
  }

  // Anything else: likely structural or valid semantic we don't restrict
  return null;
}

/**
 * Check text for raw Tailwind violations by scanning individual tokens
 * @param {string} text - Text content to check
 * @param {Set<string>} cssTokens - Available CSS tokens
 * @param {string} cssPath - Path to CSS file for error messages
 * @returns {string | null} - Error message or null if valid
 */
function checkText(text, cssTokens, cssPath) {
  const rawTokens = text.split(/\s+/);

  for (const rawToken of rawTokens) {
    if (!rawToken) continue;

    // Split variant chains: hover:bg-red-500 -> ["hover", "bg-red-500"]
    const segments = rawToken.split(":");

    for (const segment of segments) {
      if (!segment) continue;
      const error = checkClassToken(segment, cssTokens, cssPath);
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
        // Early return if not in target directories
        const filename = context.getFilename();
        if (
          !/(src\/(components|features|styles\/ui)\/|src\/app\/)/.test(filename)
        ) {
          return {};
        }

        // Get CSS tokens for this context
        const cssPath = resolveCssPath(context);
        const cssTokens = getTokensForPath(cssPath);

        // Track imported local names for cva|clsx|cn
        const trackedNames = new Set(["cva", "clsx", "cn"]);

        /**
         * @param {any} node
         * @param {string} text
         */
        function reportIfBad(node, text) {
          const msg = checkText(text, cssTokens, cssPath);
          if (msg) context.report({ node, message: msg });
        }

        /**
         * Extract strings from various AST node types
         * @param {any} node
         * @returns {Generator<[any, string]>}
         */
        function* extractStrings(node) {
          if (!node) return;
          switch (node.type) {
            case "Literal":
              if (typeof node.value === "string") yield [node, node.value];
              break;
            case "TemplateLiteral":
              for (const q of node.quasis)
                if (q.value?.raw) yield [q, q.value.raw];
              break;
            case "ArrayExpression":
              for (const el of node.elements) if (el) yield* extractStrings(el);
              break;
            case "ConditionalExpression":
              yield* extractStrings(node.consequent);
              yield* extractStrings(node.alternate);
              break;
            case "LogicalExpression":
            case "BinaryExpression":
              yield* extractStrings(node.left);
              yield* extractStrings(node.right);
              break;
            case "JSXExpressionContainer":
              yield* extractStrings(node.expression);
              break;
            case "TaggedTemplateExpression":
              yield* extractStrings(node.quasi);
              break;
            // add more if your codebase uses other shapes
          }
        }
        return {
          /**
           * Track imports to update local names for cva|clsx|cn
           * @param {any} node
           */
          ImportDeclaration(node) {
            if (node.source && typeof node.source.value === "string") {
              const source = node.source.value;
              // Track imports from class-variance-authority, clsx, classnames
              if (
                ["class-variance-authority", "clsx", "classnames"].includes(
                  source
                )
              ) {
                for (const spec of node.specifiers) {
                  if (spec.type === "ImportSpecifier" && spec.imported) {
                    const imported = spec.imported.name;
                    const local = spec.local.name;
                    if (["cva", "clsx", "cn"].includes(imported)) {
                      trackedNames.add(local);
                    }
                  } else if (spec.type === "ImportDefaultSpecifier") {
                    // Default import (e.g., import clsx from 'clsx')
                    trackedNames.add(spec.local.name);
                  }
                }
              }
            }
          },

          /**
           * Check className JSX attributes
           * @param {any} node
           */
          JSXAttribute(node) {
            if (node.name && node.name.name === "className" && node.value) {
              for (const [n, s] of extractStrings(node.value)) {
                reportIfBad(n, s);
              }
            }
          },

          /**
           * Check CVA/clsx/cn function calls
           * @param {any} node
           */
          CallExpression(node) {
            let isTrackedCall = false;

            // Handle direct calls (cva, clsx, cn)
            if (node.callee?.name && trackedNames.has(node.callee.name)) {
              isTrackedCall = true;
            }
            // Handle member expressions (e.g., utils.cn)
            else if (
              node.callee &&
              node.callee.type === "MemberExpression" &&
              node.callee.property &&
              trackedNames.has(node.callee.property.name)
            ) {
              isTrackedCall = true;
            }

            if (isTrackedCall) {
              for (const arg of node.arguments) {
                for (const [n, s] of extractStrings(arg)) {
                  reportIfBad(n, s);
                }
              }
            }
          },

          /**
           * Check object properties in CVA variant objects
           * @param {any} node
           */
          Property(node) {
            // Only check properties that are likely CVA variant values
            if (
              node.value &&
              /\b[a-z-]+(-\w+|\[\w\])/i.test(node.value.raw || "")
            ) {
              for (const [n, s] of extractStrings(node.value)) {
                reportIfBad(n, s);
              }
            }
          },
        };
      },
    },
  },
};
