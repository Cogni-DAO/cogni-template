// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/lint/eslint/debug`
 * Purpose: Debug harness for troubleshooting ESLint rule behavior during development.
 * Scope: Provides console output for rule inspection. Does NOT test specific policies.
 * Invariants: Must not affect test suite results; console output only for debugging.
 * Side-effects: IO
 * Notes: Use this test to inspect ESLint messages when developing new rules.
 * Links: tests/lint/eslint/runEslint.ts
 * @public
 */

import { describe, expect, it } from "vitest";

import { lintFixture } from "./runBiome";

// TODO: Migrate to Biome - waiting for corresponding commit
// TODO: Migrate to Biome - waiting for corresponding commit

describe.skip("Debug ESLint", () => {
  it("debug simple case", async () => {
    const result = await lintFixture(
      "src/features/home/components/X.tsx",
      `import { Button } from "@/components"; export const X = () => <Button />;`
    );

    console.log("Result:", JSON.stringify(result, null, 2));

    // Let's see what errors we get
    expect(result.errors).toBeDefined();
  });
});
