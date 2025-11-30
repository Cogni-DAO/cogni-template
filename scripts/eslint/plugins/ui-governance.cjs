// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@scripts/eslint/plugins/ui-governance`
 * Purpose: Enforce token-driven Tailwind usage while preserving ergonomic layout classes.
 * Scope: Provides ESLint rules (`no-raw-colors`, `no-arbitrary-non-token-values`, `token-classname-patterns`, `no-vendor-imports-outside-kit`) consumed by ui-governance config; Does not lint build artifacts or vendor copies.
 * Invariants: Rules ignore vendor + styles directories (allowed to use literals).
 * Side-effects: none
 * Links: docs/ui-style-spec.json
 */

const COLOR_PREFIXES = new Set([
  "bg",
  "text",
  "border",
  "ring",
  "shadow",
  "stroke",
  "fill",
]);

const COLOR_KEYWORD_ALLOW = new Set(["transparent", "current", "inherit"]);

// Non-color utility suffixes that share prefixes with color utilities
const FONT_SIZE_SUFFIXES = new Set([
  "xs",
  "sm",
  "base",
  "lg",
  "xl",
  "2xl",
  "3xl",
  "4xl",
  "5xl",
  "6xl",
  "7xl",
  "8xl",
  "9xl",
]);

const SHADOW_SIZE_SUFFIXES = new Set([
  "sm",
  "md",
  "lg",
  "xl",
  "2xl",
  "inner",
  "none",
]);

// Border width pattern: 0, 2, 4, 8, or directional like t-2, x-4, etc.
const BORDER_WIDTH_PATTERN = /^(0|2|4|8|[trblxyse](-?(0|2|4|8))?)$/;

const SEMANTIC_COLOR_SUFFIXES = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "border",
  "input",
  "ring",
  "danger",
  "warning",
  "success",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "chart-6",
  "offset-background",
];

const COLOR_SUFFIX_ALLOWLIST = SEMANTIC_COLOR_SUFFIXES;

const RAW_COLOR_SUFFIX =
  /(black|white|(amber|blue|cyan|emerald|fuchsia|gray|green|indigo|lime|neutral|orange|pink|purple|red|rose|sky|slate|stone|teal|violet|yellow|zinc)(-[0-9]{2,3})?)$/i;
const HEX_OR_COLOR_FUNC = /(#[0-9a-f]{3,8}|rgba?\(|hsla?\()/i;
const ARBITRARY_PATTERN = /\[([^\]]+)\]/;
const GRADIENT_EXCEPTIONS = /^(gradient-|clip-|none$)/;

const TRACKED_FUNCTIONS = new Set(["cn", "clsx", "classnames"]);

const IGNORE_PATH_REGEX =
  /src[\\/](components[\\/]vendor(?:[\\/]|$)|styles[\\/]|__tests__[\\/])/;

function normalizeToken(raw) {
  if (!raw) return null;
  const base = raw.split(":").pop();
  if (!base) return null;
  let token = base.trim();
  if (!token) return null;
  if (token.startsWith("!")) token = token.slice(1);
  if (token.startsWith("-")) token = token.slice(1);
  return token;
}

function tokenize(text) {
  const tokens = [];
  if (!text) return tokens;
  for (const raw of text.split(/\s+/)) {
    if (!raw) continue;
    const normalized = normalizeToken(raw);
    if (!normalized) continue;
    tokens.push({ raw, normalized });
  }
  return tokens;
}

function isColorPrefix(prefix) {
  return COLOR_PREFIXES.has(prefix);
}

function analyzeColorToken(prefix, suffix, raw) {
  const issues = [];

  if (COLOR_KEYWORD_ALLOW.has(suffix)) {
    return issues;
  }

  // Check for non-color overloads: text-sm, border-2, shadow-md, etc.
  const baseSuffix = suffix.split("/")[0];

  if (prefix === "text" && FONT_SIZE_SUFFIXES.has(baseSuffix)) {
    return issues; // text-sm, text-lg, etc. are font sizes, not colors
  }

  if (prefix === "shadow" && SHADOW_SIZE_SUFFIXES.has(baseSuffix)) {
    return issues; // shadow-md, shadow-lg, etc. are shadow sizes, not colors
  }

  if (prefix === "border" && BORDER_WIDTH_PATTERN.test(baseSuffix)) {
    return issues; // border-2, border-x-4, etc. are border widths, not colors
  }

  if (suffix.startsWith("[")) {
    const inner = suffix.slice(1, -1);
    if (!/var\(--[a-z0-9-]+\)/i.test(inner)) {
      issues.push({
        type: "ARBITRARY",
        message: `Use token variables inside arbitrary color values (received "${raw}").`,
      });
    }
    return issues;
  }

  if (GRADIENT_EXCEPTIONS.test(suffix)) {
    return issues;
  }

  if (RAW_COLOR_SUFFIX.test(baseSuffix)) {
    issues.push({
      type: "RAW_COLOR",
      message: `Raw Tailwind color "${raw}" is not allowed. Use token-prefixed colors (bg-background, text-foreground, border-border, ring-offset-background).`,
    });
    return issues;
  }

  const allowed = COLOR_SUFFIX_ALLOWLIST.some((token) =>
    baseSuffix.startsWith(token)
  );

  if (!allowed) {
    issues.push({
      type: "TOKEN_PATTERN",
      message: `${prefix}- classes must use semantic tokens (bg-background, text-foreground, border-border, ring-offset-background). Received "${raw}".`,
    });
  }

  return issues;
}

function analyzeToken(meta) {
  const issues = [];
  const token = meta.normalized;

  const bracketMatch = token.match(ARBITRARY_PATTERN);
  if (bracketMatch) {
    const inner = bracketMatch[1];
    if (!/var\(--[a-z0-9-]+\)/i.test(inner)) {
      issues.push({
        type: "ARBITRARY",
        message: `Arbitrary utility "${meta.raw}" must wrap var(--token).`,
      });
    }
    return issues;
  }

  if (!token.includes("-")) {
    return issues;
  }

  const [prefix, ...rest] = token.split("-");
  const suffix = rest.join("-");

  if (!isColorPrefix(prefix)) {
    return issues;
  }

  if (HEX_OR_COLOR_FUNC.test(suffix)) {
    issues.push({
      type: "RAW_COLOR",
      message: `Raw color literal "${meta.raw}" is disallowed. Use token-prefixed classes.`,
    });
    return issues;
  }

  return analyzeColorToken(prefix, suffix, meta.raw);
}

function* extractStrings(node) {
  if (!node) return;
  switch (node.type) {
    case "Literal":
      if (typeof node.value === "string") yield [node, node.value];
      break;
    case "TemplateLiteral":
      for (const quasi of node.quasis) {
        if (quasi.value?.cooked) yield [quasi, quasi.value.cooked];
      }
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
  }
}

function createClassRule(ruleId, filterTypes) {
  return {
    meta: {
      type: "problem",
      docs: {
        description: `UI governance rule: ${ruleId}`,
        recommended: true,
      },
      schema: [],
    },
    create(context) {
      const filename = context.getFilename ? context.getFilename() : "";
      if (IGNORE_PATH_REGEX.test(filename)) {
        return {};
      }

      const trackedNames = new Set(TRACKED_FUNCTIONS);

      function reportFromText(node, text) {
        for (const token of tokenize(text)) {
          for (const issue of analyzeToken(token)) {
            if (!filterTypes.has(issue.type)) continue;
            context.report({ node, message: issue.message });
          }
        }
      }

      /**
       * Determine if call expression callee matches trackedNames
       */
      function isTrackedCall(node) {
        if (!node || !node.callee) return false;
        if (
          node.callee.type === "Identifier" &&
          trackedNames.has(node.callee.name)
        ) {
          return true;
        }
        if (
          node.callee.type === "MemberExpression" &&
          node.callee.property &&
          node.callee.property.type === "Identifier" &&
          trackedNames.has(node.callee.property.name)
        ) {
          return true;
        }
        return false;
      }

      return {
        ImportDeclaration(node) {
          const source = node.source?.value;
          if (typeof source !== "string") return;
          if (
            source === "clsx" ||
            source === "classnames" ||
            source === "@/shared/util"
          ) {
            for (const spec of node.specifiers) {
              if (spec.local?.name) {
                trackedNames.add(spec.local.name);
              }
            }
          }
        },

        JSXAttribute(node) {
          if (!node.name || node.name.name !== "className" || !node.value) {
            return;
          }
          for (const [innerNode, text] of extractStrings(node.value)) {
            reportFromText(innerNode, text);
          }
        },

        CallExpression(node) {
          if (!isTrackedCall(node)) return;
          for (const arg of node.arguments) {
            for (const [innerNode, text] of extractStrings(arg)) {
              reportFromText(innerNode, text);
            }
          }
        },
      };
    },
  };
}

function createVendorRule() {
  const vendorAlias = "@/components/vendor/ui-primitives/shadcn";
  const allowPattern = /src[\\/](components[\\/]kit|components[\\/]vendor)/;

  return {
    meta: {
      type: "problem",
      docs: {
        description:
          "Disallow importing vendor primitives outside kit wrappers.",
        recommended: true,
      },
      schema: [],
    },
    create(context) {
      const filename = context.getFilename ? context.getFilename() : "";
      if (allowPattern.test(filename)) {
        return {};
      }

      return {
        ImportDeclaration(node) {
          const source = node.source?.value;
          if (typeof source !== "string") return;
          if (source.startsWith(vendorAlias)) {
            context.report({
              node,
              message:
                "Vendor primitives must be wrapped inside src/components/kit/**. Import the kit component instead.",
            });
          }
        },
      };
    },
  };
}

module.exports = {
  rules: {
    "no-raw-colors": createClassRule("no-raw-colors", new Set(["RAW_COLOR"])),
    "no-arbitrary-non-token-values": createClassRule(
      "no-arbitrary-non-token-values",
      new Set(["ARBITRARY"])
    ),
    "token-classname-patterns": createClassRule(
      "token-classname-patterns",
      new Set(["TOKEN_PATTERN"])
    ),
    "no-vendor-imports-outside-kit": createVendorRule(),
  },
};
