// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@scripts/eslint/plugins/no-vendor-sdk-imports`
 * Purpose: ESLint rule that prevents vendor SDK imports in core application code, enforcing hexagonal architecture.
 * Scope: Blocks proprietary SaaS SDKs from src/** to prevent vendor lock-in and maintain portability. Does not restrict infra adapter implementations.
 * Invariants: Core code must use infra adapters; vendor SDKs only allowed in src/infra/**.
 * Side-effects: none
 * Notes: Covers observability, auth, BaaS, queue/cache, feature flags, and chat SDKs per hexagonal architecture.
 * Links: eslint/no-vendor-sdk-imports.config.mjs, docs/ARCHITECTURE.md
 * @public
 */

// Vendor scopes that are blocked entirely from core code
const BLOCKED_VENDOR_SCOPES = [
  "@vercel/*",
  "@sentry/*",
  "@datadog/*",
  "@clerk/*",
  "@auth0/*",
  "@supabase/*",
  "@upstash/*",
  "@amplitude/*",
  "@segment/*",
  "@fullstory/*",
  "@intercom/*",
];

// Specific vendor packages that are blocked from core code
const BLOCKED_VENDOR_PATHS = [
  // Observability SaaS
  "newrelic",
  "dd-trace",
  "logrocket",
  "analytics-node",
  "mixpanel-browser",
  "mixpanel",
  "hotjar",
  "posthog-js",
  "posthog-node",
  "@hotjar/browser",
  "bugsnag",
  "rollbar",
  "honeybadger",

  // Firebase (BaaS)
  "firebase/app",
  "firebase/auth",
  "firebase/firestore",
  "firebase/database",

  // Feature Flags SaaS
  "launchdarkly-node-server-sdk",
  "launchdarkly-react-client-sdk",
  "configcat-node",
  "configcat-js",

  // Other BaaS
  "appwrite",
  "pocketbase",

  // Chat/Support
  "crisp-sdk-web",
];

/**
 * Check if an import path matches any blocked vendor pattern
 * @param {string} importPath - The import path to check
 * @returns {string | null} - Error message or null if allowed
 */
function checkImportPath(importPath) {
  // Check blocked scopes (patterns with wildcards)
  for (const pattern of BLOCKED_VENDOR_SCOPES) {
    const scopePrefix = pattern.replace("/*", "");
    if (importPath.startsWith(scopePrefix)) {
      return `Vendor SDK import "${importPath}" is not allowed in core application code. Move to src/infra/ adapter if needed.`;
    }
  }

  // Check blocked specific paths
  for (const blockedPath of BLOCKED_VENDOR_PATHS) {
    if (
      importPath === blockedPath ||
      importPath.startsWith(`${blockedPath}/`)
    ) {
      return `Vendor SDK import "${importPath}" is not allowed in core application code. Move to src/infra/ adapter if needed.`;
    }
  }

  return null;
}

module.exports = {
  rules: {
    "no-vendor-sdk-imports": {
      meta: {
        type: "problem",
        docs: {
          description:
            "Prevent vendor SDK imports in core code to maintain hexagonal architecture",
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
         * @param {string} importPath
         */
        function checkAndReport(node, importPath) {
          const errorMessage = checkImportPath(importPath);
          if (errorMessage) {
            context.report({
              node,
              message: errorMessage,
            });
          }
        }

        return {
          // Handle ES6 import statements: import { foo } from 'vendor-pkg'
          ImportDeclaration(node) {
            if (node.source && typeof node.source.value === "string") {
              checkAndReport(node, node.source.value);
            }
          },

          // Handle dynamic imports: import('vendor-pkg')
          ImportExpression(node) {
            if (
              node.source &&
              node.source.type === "Literal" &&
              typeof node.source.value === "string"
            ) {
              checkAndReport(node, node.source.value);
            }
          },

          // Handle require() calls: const pkg = require('vendor-pkg')
          CallExpression(node) {
            if (
              node.callee &&
              node.callee.type === "Identifier" &&
              node.callee.name === "require" &&
              node.arguments.length > 0 &&
              node.arguments[0].type === "Literal" &&
              typeof node.arguments[0].value === "string"
            ) {
              checkAndReport(node, node.arguments[0].value);
            }
          },
        };
      },
    },
  },
};
