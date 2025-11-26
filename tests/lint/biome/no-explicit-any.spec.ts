// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/lint/biome/no-explicit-any`
 * Purpose: Verifies Biome detects explicit any types.
 * Scope: Covers noExplicitAny rule. Does NOT test runtime behavior.
 * Invariants: Explicit any types are flagged as errors.
 * Side-effects: IO (via runBiome temp file creation)
 * Notes: Tests Biome's any type detection (Commit 6).
 * Links: biome/base.json suspicious rules
 * @public
 */

import { describe, expect, it } from "vitest";

import { lintFixture } from "./runBiome";

describe("No Explicit Any", () => {
  it("flags explicit any type in function parameters", async () => {
    const { messages } = await lintFixture(
      "test.ts",
      `export function example(param: any) {
  return param;
}`,
      { focusRulePrefixes: ["lint/suspicious/noExplicitAny"] }
    );

    expect(
      messages.some((m) => m.ruleId === "lint/suspicious/noExplicitAny")
    ).toBe(true);
  });

  it("flags explicit any type in variable declarations", async () => {
    const { messages } = await lintFixture(
      "test.ts",
      `const value: any = 42;
export { value };`,
      { focusRulePrefixes: ["lint/suspicious/noExplicitAny"] }
    );

    expect(
      messages.some((m) => m.ruleId === "lint/suspicious/noExplicitAny")
    ).toBe(true);
  });

  it("flags explicit any type in function return types", async () => {
    const { messages } = await lintFixture(
      "test.ts",
      `export function example(): any {
  return 42;
}`,
      { focusRulePrefixes: ["lint/suspicious/noExplicitAny"] }
    );

    expect(
      messages.some((m) => m.ruleId === "lint/suspicious/noExplicitAny")
    ).toBe(true);
  });

  it("allows code without any types", async () => {
    const { messages } = await lintFixture(
      "test.ts",
      `export function example(param: string): number {
  return param.length;
}`,
      { focusRulePrefixes: ["lint/suspicious/noExplicitAny"] }
    );

    expect(
      messages.filter((m) => m.ruleId === "lint/suspicious/noExplicitAny")
    ).toHaveLength(0);
  });

  it("allows inferred types", async () => {
    const { messages } = await lintFixture(
      "test.ts",
      `export function example() {
  const value = 42;
  return value;
}`,
      { focusRulePrefixes: ["lint/suspicious/noExplicitAny"] }
    );

    expect(
      messages.filter((m) => m.ruleId === "lint/suspicious/noExplicitAny")
    ).toHaveLength(0);
  });
});
