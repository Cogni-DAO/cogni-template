// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/lint/eslint/no-explicit-any`
 * Purpose: Verifies ESLint detects explicit any types.
 * Scope: Covers @typescript-eslint/no-explicit-any rule. Does NOT test runtime behavior.
 * Invariants: Explicit any types are flagged as errors.
 * Side-effects: IO (via runEslint temp file creation)
 * Notes: Tests ESLint's any type detection.
 * Links: eslint/base.config.mjs typescript rules
 * @public
 */

import { describe, expect, it } from "vitest";

import { lintFixture } from "./runEslint";

// Migrated to Biome (Commit 6) - see tests/lint/biome/no-explicit-any.spec.ts
describe.skip("No Explicit Any", () => {
  it("flags explicit any type in function parameters", async () => {
    const { messages } = await lintFixture(
      "test.ts",
      `export function example(param: any) {
  return param;
}`,
      { focusRulePrefixes: ["@typescript-eslint/no-explicit-any"] }
    );

    expect(
      messages.some((m) => m.ruleId === "@typescript-eslint/no-explicit-any")
    ).toBe(true);
  });

  it("flags explicit any type in variable declarations", async () => {
    const { messages } = await lintFixture(
      "test.ts",
      `const value: any = 42;
export { value };`,
      { focusRulePrefixes: ["@typescript-eslint/no-explicit-any"] }
    );

    expect(
      messages.some((m) => m.ruleId === "@typescript-eslint/no-explicit-any")
    ).toBe(true);
  });

  it("flags explicit any type in function return types", async () => {
    const { messages } = await lintFixture(
      "test.ts",
      `export function example(): any {
  return 42;
}`,
      { focusRulePrefixes: ["@typescript-eslint/no-explicit-any"] }
    );

    expect(
      messages.some((m) => m.ruleId === "@typescript-eslint/no-explicit-any")
    ).toBe(true);
  });

  it("allows code without any types", async () => {
    const { messages } = await lintFixture(
      "test.ts",
      `export function example(param: string): number {
  return param.length;
}`,
      { focusRulePrefixes: ["@typescript-eslint/no-explicit-any"] }
    );

    expect(
      messages.filter((m) => m.ruleId === "@typescript-eslint/no-explicit-any")
    ).toHaveLength(0);
  });

  it("allows inferred types", async () => {
    const { messages } = await lintFixture(
      "test.ts",
      `export function example() {
  const value = 42;
  return value;
}`,
      { focusRulePrefixes: ["@typescript-eslint/no-explicit-any"] }
    );

    expect(
      messages.filter((m) => m.ruleId === "@typescript-eslint/no-explicit-any")
    ).toHaveLength(0);
  });
});
