// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/lint/eslint/no-raw-tailwind`
 * Purpose: Verifies no-raw-tailwind rule blocks raw Tailwind utilities in favor of design tokens.
 * Scope: Covers string literals and template literals with Tailwind classes. Does not test runtime behavior.
 * Invariants: Raw palette/numeric utilities blocked; token forms and semantic utilities allowed.
 * Side-effects: IO (via runEslint temp file creation)
 * Notes: Tests no-raw-tailwind/no-raw-tailwind-classes rule implementation.
 * Links: scripts/eslint/plugins/no-raw-tailwind.cjs, src/styles/theme.ts
 * @public
 */

import { describe, expect, it } from "vitest";

import { lintFixture } from "./runEslint";

describe("No Raw Tailwind ESLint Rule", () => {
  it("should warn on raw palette utilities", async () => {
    const { warnings, messages } = await lintFixture(
      "src/components/test.tsx",
      `export const Component = () => <div className="bg-red-500 text-blue-600" />;`,
      {
        focusRulePrefixes: ["no-raw-tailwind"],
      }
    );

    expect(warnings).toBeGreaterThan(0);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "no-raw-tailwind/no-raw-tailwind-classes",
          message:
            "Use tokens: var(--...) or semantic utilities. No raw palette or numeric utilities.",
        }),
      ])
    );
  });

  it("should warn on numeric size utilities", async () => {
    const { warnings, messages } = await lintFixture(
      "src/components/test.tsx",
      `export const Component = () => <div className="h-12 w-8 p-4" />;`,
      {
        focusRulePrefixes: ["no-raw-tailwind"],
      }
    );

    expect(warnings).toBeGreaterThan(0);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "no-raw-tailwind/no-raw-tailwind-classes",
          message:
            "Use tokens: var(--...) or semantic utilities. No raw palette or numeric utilities.",
        }),
      ])
    );
  });

  it("should allow CSS custom property tokens", async () => {
    const { warnings } = await lintFixture(
      "src/components/test.tsx",
      `export const Component = () => <div className="bg-[hsl(var(--color-primary))] h-[var(--size-icon-md)]" />;`,
      {
        focusRulePrefixes: ["no-raw-tailwind"],
      }
    );

    expect(warnings).toBe(0);
  });

  it("should allow semantic utilities from theme", async () => {
    const { warnings } = await lintFixture(
      "src/components/test.tsx",
      `export const Component = () => <div className="bg-primary text-foreground border-input rounded-md" />;`,
      {
        focusRulePrefixes: ["no-raw-tailwind"],
      }
    );

    expect(warnings).toBe(0);
  });

  it("should allow template literals with tokens", async () => {
    const { warnings } = await lintFixture(
      "src/components/test.tsx",
      `export const Component = ({ variant }: { variant: string }) => {
        const classes = \`bg-\${variant} text-primary\`;
        return <div className={classes} />;
      };`,
      {
        focusRulePrefixes: ["no-raw-tailwind"],
      }
    );

    expect(warnings).toBe(0);
  });

  it("should exempt vendor components", async () => {
    const { warnings } = await lintFixture(
      "src/components/vendor/test.tsx",
      `export const VendorComponent = () => <div className="bg-red-500 h-12" />;`,
      {
        focusRulePrefixes: ["no-raw-tailwind"],
      }
    );

    expect(warnings).toBe(0);
  });
});
