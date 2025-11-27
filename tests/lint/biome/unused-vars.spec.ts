// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/lint/biome/unused-vars`
 * Purpose: Verifies Biome detects unused variables and imports.
 * Scope: Covers noUnusedVariables and noUnusedImports rules. Does NOT test runtime behavior.
 * Invariants: Underscore-prefixed variables allowed; unused imports flagged.
 * Side-effects: IO (via runBiome temp file creation)
 * Notes: Tests Biome's unused code detection (Commit 5).
 * Links: biome/base.json correctness rules
 * @public
 */

import { describe, expect, it } from "vitest";

import { lintFixture } from "./runBiome";

describe("Unused Variables and Imports", () => {
  describe("noUnusedVariables", () => {
    it("flags unused variables", async () => {
      const { messages } = await lintFixture(
        "test.ts",
        `export function example() {
  const unused = 42;
  const used = 10;
  return used;
}`,
        { focusRulePrefixes: ["lint/correctness/noUnusedVariables"] }
      );

      expect(
        messages.some((m) => m.ruleId === "lint/correctness/noUnusedVariables")
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
        { focusRulePrefixes: ["lint/correctness/noUnusedVariables"] }
      );

      expect(
        messages.filter(
          (m) => m.ruleId === "lint/correctness/noUnusedVariables"
        )
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
        { focusRulePrefixes: ["lint/correctness/noUnusedVariables"] }
      );

      expect(
        messages.filter(
          (m) => m.ruleId === "lint/correctness/noUnusedVariables"
        )
      ).toHaveLength(0);
    });
  });

  describe("noUnusedImports", () => {
    it("flags unused imports", async () => {
      const { messages } = await lintFixture(
        "test.ts",
        `import { useState, useEffect } from "react";

export function Component() {
  const [count] = useState(0);
  return <div>{count}</div>;
}`,
        { focusRulePrefixes: ["lint/correctness/noUnusedImports"] }
      );

      expect(
        messages.some((m) => m.ruleId === "lint/correctness/noUnusedImports")
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
        { focusRulePrefixes: ["lint/correctness/noUnusedImports"] }
      );

      expect(
        messages.filter((m) => m.ruleId === "lint/correctness/noUnusedImports")
      ).toHaveLength(0);
    });

    it("flags completely unused import statements", async () => {
      const { messages } = await lintFixture(
        "test.ts",
        `import { something } from "lib";

export function example() {
  return 42;
}`,
        { focusRulePrefixes: ["lint/correctness/noUnusedImports"] }
      );

      expect(
        messages.some((m) => m.ruleId === "lint/correctness/noUnusedImports")
      ).toBe(true);
    });
  });
});
