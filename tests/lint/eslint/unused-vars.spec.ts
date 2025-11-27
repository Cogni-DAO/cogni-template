// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/lint/eslint/unused-vars`
 * Purpose: Verifies ESLint detects unused variables and imports.
 * Scope: Covers @typescript-eslint/no-unused-vars and unused-imports rules. Does NOT test runtime behavior.
 * Invariants: Underscore-prefixed variables allowed; unused imports flagged.
 * Side-effects: IO (via runEslint temp file creation)
 * Notes: Tests ESLint's unused code detection.
 * Links: eslint/base.config.mjs typescript rules
 * @public
 */

import { describe, expect, it } from "vitest";

import { lintFixture } from "./runEslint";

// Migrated to Biome (Commit 5) - see tests/lint/biome/unused-vars.spec.ts
describe.skip("Unused Variables and Imports", () => {
  describe("@typescript-eslint/no-unused-vars", () => {
    it("flags unused variables", async () => {
      const { messages } = await lintFixture(
        "test.ts",
        `export function example() {
  const unused = 42;
  const used = 10;
  return used;
}`,
        { focusRulePrefixes: ["@typescript-eslint/no-unused-vars"] }
      );

      expect(
        messages.some((m) => m.ruleId === "@typescript-eslint/no-unused-vars")
      ).toBe(true);
    });

    it("allows underscore-prefixed unused variables", async () => {
      const { messages } = await lintFixture(
        "test.ts",
        `export function example() {
  const _unused = 42;
  const used = 10;
  return used;
}`,
        { focusRulePrefixes: ["@typescript-eslint/no-unused-vars"] }
      );

      expect(
        messages.filter((m) => m.ruleId === "@typescript-eslint/no-unused-vars")
      ).toHaveLength(0);
    });

    it("allows all variables when used", async () => {
      const { messages } = await lintFixture(
        "test.ts",
        `export function example() {
  const a = 1;
  const b = 2;
  return a + b;
}`,
        { focusRulePrefixes: ["@typescript-eslint/no-unused-vars"] }
      );

      expect(
        messages.filter((m) => m.ruleId === "@typescript-eslint/no-unused-vars")
      ).toHaveLength(0);
    });
  });

  describe("unused-imports/no-unused-imports", () => {
    it("flags unused imports", async () => {
      const { messages } = await lintFixture(
        "test.ts",
        `import { useState, useEffect } from "react";

export function Component() {
  const [count] = useState(0);
  return <div>{count}</div>;
}`,
        { focusRulePrefixes: ["unused-imports/"] }
      );

      expect(
        messages.some((m) => m.ruleId === "unused-imports/no-unused-imports")
      ).toBe(true);
    });

    it("allows all imports when used", async () => {
      const { messages } = await lintFixture(
        "test.ts",
        `import { useState, useEffect } from "react";

export function Component() {
  const [count] = useState(0);
  useEffect(() => {}, [count]);
  return <div>{count}</div>;
}`,
        { focusRulePrefixes: ["unused-imports/"] }
      );

      expect(
        messages.filter((m) => m.ruleId === "unused-imports/no-unused-imports")
      ).toHaveLength(0);
    });

    it("flags completely unused import statements", async () => {
      const { messages } = await lintFixture(
        "test.ts",
        `import { something } from "lib";

export function example() {
  return 42;
}`,
        { focusRulePrefixes: ["unused-imports/"] }
      );

      expect(
        messages.some((m) => m.ruleId === "unused-imports/no-unused-imports")
      ).toBe(true);
    });
  });
});
