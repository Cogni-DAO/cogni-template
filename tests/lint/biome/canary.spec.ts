// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/lint/biome/canary`
 * Purpose: Smoke-test Biome noDefaultExport rule for Commit 2B.
 * Scope: Validates noDefaultExport fires and App Router override works. Does NOT test other rules.
 * Invariants: Uses tests/lint/fixtures/ only; 1:1 parity with ESLint canary pattern.
 * Side-effects: none
 * Notes: Minimal coverage for Commit 2B migration verification.
 * Links: biome.json, biome/app.json
 * @public
 */

import { describe, expect, it } from "vitest";

import { lintFixture } from "./runBiome";

describe("Biome noDefaultExport canary (Commit 2B)", () => {
  it("flags default export in component files", async () => {
    // Using existing fixture with default export
    const result = await lintFixture("classnames/fail_literal_string.tsx");

    expect(
      result.messages.some((m) => m.ruleId === "lint/style/noDefaultExport")
    ).toBe(true);
  });

  it("allows default export in App Router page files", async () => {
    // Use existing App Router fixture but evaluate at proper page.tsx path
    const result = await lintFixture(
      "app/fail_page_literal_classes.tsx",
      undefined,
      {
        virtualRepoPath: "src/app/__biome_test__/page.tsx",
      }
    );

    expect(
      result.messages.some((m) => m.ruleId === "lint/style/noDefaultExport")
    ).toBe(false);
  });
});
