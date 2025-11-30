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

import { lintFixture } from "./runEslint";

const focus = { focusRulePrefixes: ["ui-governance"] };

describe("UI Governance Rules", () => {
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

  describe("Non-color utility overloads", () => {
    it("allows font-size utilities (text-sm, text-lg, etc.)", async () => {
      const { errors } = await lintFixture(
        "src/features/home/components/Test.tsx",
        `export const Component = () => <div className="text-xs text-sm text-base text-lg text-xl text-2xl text-3xl" />;`,
        focus
      );

      expect(errors).toBe(0);
    });

    it("allows shadow-size utilities (shadow-sm, shadow-md, etc.)", async () => {
      const { errors } = await lintFixture(
        "src/features/home/components/Test.tsx",
        `export const Component = () => <div className="shadow-sm shadow-md shadow-lg shadow-xl shadow-2xl shadow-inner shadow-none" />;`,
        focus
      );

      expect(errors).toBe(0);
    });

    it("allows border-width utilities (border-2, border-x-4, etc.)", async () => {
      const { errors } = await lintFixture(
        "src/features/home/components/Test.tsx",
        `export const Component = () => <div className="border-0 border-2 border-4 border-8 border-t-2 border-x-4 border-b-0" />;`,
        focus
      );

      expect(errors).toBe(0);
    });

    it("blocks text- with raw color suffixes (text-red-500, text-white)", async () => {
      const { errors, messages } = await lintFixture(
        "src/features/home/components/Test.tsx",
        `export const Component = () => <div className="text-red-500 text-white text-gray-600" />;`,
        focus
      );

      expect(errors).toBeGreaterThan(0);
      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: "ui-governance/no-raw-colors",
            message: expect.stringContaining("Raw Tailwind color"),
          }),
        ])
      );
    });

    it("blocks border- with raw color suffixes (border-red-500)", async () => {
      const { errors, messages } = await lintFixture(
        "src/features/home/components/Test.tsx",
        `export const Component = () => <div className="border-red-500 border-zinc-900" />;`,
        focus
      );

      expect(errors).toBeGreaterThan(0);
      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: "ui-governance/no-raw-colors",
            message: expect.stringContaining("Raw Tailwind color"),
          }),
        ])
      );
    });

    it("blocks shadow- with color suffixes (shadow-blue-500)", async () => {
      const { errors, messages } = await lintFixture(
        "src/features/home/components/Test.tsx",
        `export const Component = () => <div className="shadow-blue-500" />;`,
        focus
      );

      expect(errors).toBeGreaterThan(0);
      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: "ui-governance/no-raw-colors",
            message: expect.stringContaining("Raw Tailwind color"),
          }),
        ])
      );
    });

    it("blocks text-[#fff] but allows text-sm", async () => {
      const { errors, messages } = await lintFixture(
        "src/features/home/components/Test.tsx",
        `export const Component = () => <div className="text-sm text-[#fff]" />;`,
        focus
      );

      expect(errors).toBe(1); // Only text-[#fff] should error
      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: "ui-governance/no-arbitrary-non-token-values",
            message: expect.stringContaining("text-[#fff]"),
          }),
        ])
      );
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
