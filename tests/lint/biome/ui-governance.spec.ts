// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/lint/eslint/ui-governance`
 * Purpose: Verifies the custom UI governance ESLint rules (token-safe Tailwind usage + vendor isolation).
 * Scope: Covers raw color detection, arbitrary value enforcement, semantic allowances, and vendor import boundaries; Does not test ESLint engine internals or architectural boundaries.
 * Invariants: Raw palette/hex/arbitrary values are rejected unless they wrap tokens; vendor primitives can only be imported from kit.
 * Side-effects: IO (via runEslint temp file creation)
 * Links: scripts/eslint/plugins/ui-governance.cjs, docs/ui-style-spec.json
 * @public
 */

import { describe, expect, it } from "vitest";

import { lintFixture } from "./runBiome";

// TODO: Migrate to Biome - waiting for corresponding commit
// TODO: Migrate to Biome - waiting for corresponding commit

const focus = { focusRulePrefixes: ["ui-governance"] };

describe.skip("UI Governance Rules", () => {
  describe("Token-safe class usage", () => {
    it("blocks raw palette utilities", async () => {
      const { errors, messages } = await lintFixture(
        "src/features/home/components/Test.tsx",
        `export const Component = () => <div className="bg-red-500 text-gray-600 border-sky-300" />;`,
        focus
      );

      expect(errors).toBeGreaterThan(0);
      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: "ui-governance/no-raw-colors",
            message: expect.stringContaining('Raw Tailwind color "bg-red-500"'),
          }),
        ])
      );
    });

    it("blocks raw hex/rgb values", async () => {
      const { errors, messages } = await lintFixture(
        "src/features/home/components/Test.tsx",
        `export const Component = () => <div className="text-[#fff] bg-[rgb(10,10,10)]" />;`,
        focus
      );

      expect(errors).toBeGreaterThan(0);
      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: "ui-governance/no-arbitrary-non-token-values",
            message: expect.stringContaining(
              'Arbitrary utility "text-[#fff]" must wrap var(--token)'
            ),
          }),
        ])
      );
    });

    it("allows semantic token-prefixed utilities", async () => {
      const { errors } = await lintFixture(
        "src/features/home/components/Test.tsx",
        `export const Component = () => <div className="bg-background text-foreground border-border ring-primary ring-offset-background flex gap-4" />;`,
        focus
      );

      expect(errors).toBe(0);
    });
  });

  describe("Arbitrary values", () => {
    it("blocks arbitrary values that are not token-driven", async () => {
      const { errors, messages } = await lintFixture(
        "src/features/home/components/Test.tsx",
        `export const Component = () => <div className="gap-[12px] px-[1.25rem]" />;`,
        focus
      );

      expect(errors).toBeGreaterThan(0);
      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: "ui-governance/no-arbitrary-non-token-values",
            message: expect.stringContaining(
              'Arbitrary utility "gap-[12px]" must wrap var(--token)'
            ),
          }),
        ])
      );
    });

    it("allows arbitrary values that reference tokens", async () => {
      const { errors } = await lintFixture(
        "src/features/home/components/Test.tsx",
        `export const Component = () => <div className="gap-[var(--spacing-lg)] px-[var(--spacing-xl)]" />;`,
        focus
      );

      expect(errors).toBe(0);
    });

    it("allows structural/layout utilities from Tailwind scale", async () => {
      const { errors } = await lintFixture(
        "src/features/home/components/Test.tsx",
        `export const Component = () => <div className="flex grid gap-4 px-6 py-4 sm:mt-8" />;`,
        focus
      );

      expect(errors).toBe(0);
    });
  });

  describe("Vendor imports", () => {
    it("blocks vendor imports outside kit", async () => {
      const { errors, messages } = await lintFixture(
        "src/features/home/components/Test.tsx",
        `import { Button } from "@/components/vendor/ui-primitives/shadcn/button";
         export const Component = () => <Button />;`,
        focus
      );

      expect(errors).toBeGreaterThan(0);
      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: "ui-governance/no-vendor-imports-outside-kit",
            message: expect.stringContaining(
              "Vendor primitives must be wrapped inside src/components/kit"
            ),
          }),
        ])
      );
    });

    it("allows vendor imports within kit wrappers", async () => {
      const { errors } = await lintFixture(
        "src/components/kit/data-display/Test.tsx",
        `import { Button } from "@/components/vendor/ui-primitives/shadcn/button";
         export const KitButton = () => <Button />;`,
        focus
      );

      expect(errors).toBe(0);
    });
  });
});
