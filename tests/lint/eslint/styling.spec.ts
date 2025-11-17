// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/lint/eslint/styling`
 * Purpose: Verifies token-driven styling rules (UI governance) behave as expected for literals + CVA.
 * Scope: Covers literal className usage with semantic tokens, raw palettes, arbitrary values, plus CVA + styles exemptions; Does not test boundaries or vendor import rules (handled in other specs).
 * Invariants: Token-prefixed utilities pass; raw palettes + arbitrary non-token values fail; CVA + styles literals remain allowed.
 * Side-effects: IO (via runEslint temp file creation)
 * Notes: Complements ui-governance.spec with quick smoke tests on literal usage.
 * Links: eslint/ui-governance.config.mjs, docs/ui-style-spec.json
 * @public
 */

import { describe, expect, it } from "vitest";

import { lintFixture } from "./runEslint";

describe("Token-Driven Styling Policy", () => {
  it("allows literal className with token-prefixed utilities", async () => {
    const { errors } = await lintFixture(
      "src/app/page.tsx",
      `export default () => <div className="bg-background text-foreground border-border ring-offset-background flex gap-4 px-[var(--spacing-lg)]" />;`
    );
    expect(errors).toBe(0);
  });

  it("blocks raw palette literals", async () => {
    const { errors } = await lintFixture(
      "src/app/page.tsx",
      `export default () => <div className="bg-red-500 text-gray-600" />;`
    );
    expect(errors).toBeGreaterThan(0);
  });

  it("blocks arbitrary values that are not tokenized", async () => {
    const { errors } = await lintFixture(
      "src/app/page.tsx",
      `export default () => <div className="gap-[12px] px-[1.25rem]" />;`
    );
    expect(errors).toBeGreaterThan(0);
  });

  it("allows CVA usage in kit", async () => {
    const { errors } = await lintFixture(
      "src/components/kit/inputs/Button.tsx",
      `import { button } from "@/styles/ui"; export const Button = () => <button className={button({variant:"primary"})} />;`
    );
    expect(errors).toBe(0);
  });

  it("allows literals in styles definitions", async () => {
    const { errors } = await lintFixture(
      "src/styles/ui/index.ts",
      `import { cva } from "class-variance-authority"; export const button = cva("flex gap-2");`,
      {
        ignoreRules: ["import/no-unresolved", "node/no-missing-import"],
        focusRulePrefixes: ["no-restricted-syntax"],
      }
    );
    expect(errors).toBe(0);
  });
});
