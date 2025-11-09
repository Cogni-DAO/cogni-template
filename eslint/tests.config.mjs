/** @type {import('eslint').Linter.Config[]} */
export default [
  // Test file overrides
  {
    files: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}", "tests/**", "e2e/**"],
    rules: {
      "boundaries/entry-point": "off",
      "boundaries/element-types": "off",
      "boundaries/no-unknown-files": "off",
      "no-restricted-imports": "off",
      "tsdoc/syntax": "off",
      "no-inline-comments": "off",
    },
  },

  // Documentation template overrides - disable TSDoc rules for example files
  {
    files: ["docs/templates/**/*.{ts,tsx}"],
    rules: {
      "tsdoc/syntax": "off",
      "jsdoc/*": "off",
    },
  },
];
