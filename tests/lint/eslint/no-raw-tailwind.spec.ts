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
  // Test Group 1: Raw color palettes (previously missed)
  it("should catch raw color palette utilities", async () => {
    const { warnings, messages } = await lintFixture(
      "src/components/test.tsx",
      `export const Component = () => <div className="bg-red-500 text-slate-700 border-sky-300" />;`,
      { focusRulePrefixes: ["no-raw-tailwind"] }
    );

    expect(warnings).toBeGreaterThan(0);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "no-raw-tailwind/no-raw-tailwind-classes",
          message: expect.stringContaining('Raw Tailwind value "bg-red-500"'),
        }),
      ])
    );
  });

  // Test Group 2: Variants (previously missed)
  it("should catch variants with raw utilities", async () => {
    const { warnings, messages } = await lintFixture(
      "src/components/test.tsx",
      `export const Component = () => <div className="hover:bg-red-500 sm:h-4 dark:text-slate-300" />;`,
      { focusRulePrefixes: ["no-raw-tailwind"] }
    );

    expect(warnings).toBeGreaterThan(0);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "no-raw-tailwind/no-raw-tailwind-classes",
          message: expect.stringContaining('Raw Tailwind value "bg-red-500"'),
        }),
      ])
    );
  });

  // Test Group 3: Negative utilities (previously missed)
  it("should catch negative utilities", async () => {
    const { warnings, messages } = await lintFixture(
      "src/components/test.tsx",
      `export const Component = () => <div className="-translate-y-2 -mt-4 -inset-x-1" />;`,
      { focusRulePrefixes: ["no-raw-tailwind"] }
    );

    expect(warnings).toBeGreaterThan(0);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "no-raw-tailwind/no-raw-tailwind-classes",
          message: expect.stringContaining(
            'Raw Tailwind value "-translate-y-2"'
          ),
        }),
      ])
    );
  });

  // Test Group 4: Alpha suffixes and mixed patterns (previously missed)
  it("should catch alpha suffixes and mixed utility patterns", async () => {
    const { warnings, messages } = await lintFixture(
      "src/components/test.tsx",
      `export const Component = () => <div className="bg-primary/80 from-slate-900/60" />;`,
      { focusRulePrefixes: ["no-raw-tailwind"] }
    );

    expect(warnings).toBeGreaterThan(0);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "no-raw-tailwind/no-raw-tailwind-classes",
          message: expect.stringContaining(
            'Raw Tailwind value "from-slate-900/60"'
          ),
        }),
      ])
    );
  });

  // Test Group 5: Other value utilities (shadow, blur, etc.)
  it("should catch other value-bearing utilities", async () => {
    const { warnings, messages } = await lintFixture(
      "src/components/test.tsx",
      `export const Component = () => <div className="shadow-lg blur-sm aspect-[4/3]" />;`,
      { focusRulePrefixes: ["no-raw-tailwind"] }
    );

    expect(warnings).toBeGreaterThan(0);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "no-raw-tailwind/no-raw-tailwind-classes",
          message: expect.stringContaining('Raw Tailwind value "shadow-lg"'),
        }),
      ])
    );
  });

  // Test Group 6: Arbitrary text utilities (should still be caught)
  it("should catch arbitrary text size utilities", async () => {
    const { warnings, messages } = await lintFixture(
      "src/components/test.tsx",
      `export const Component = () => <div className="text-[14px] text-[1.5rem] text-[var(--custom)]" />;`,
      { focusRulePrefixes: ["no-raw-tailwind"] }
    );

    expect(warnings).toBeGreaterThan(0);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "no-raw-tailwind/no-raw-tailwind-classes",
          message: expect.stringContaining(
            'Raw arbitrary value not allowed. Use bracketed tokens with var(--token) syntax. In "text-[14px]"'
          ),
        }),
      ])
    );
  });

  // Test Group 7: Max-width and sizing utilities
  it("should catch max-width and size utilities", async () => {
    const { warnings, messages } = await lintFixture(
      "src/components/test.tsx",
      `export const Component = () => <div className="max-w-3xl size-6 size-8 size-12" />;`,
      { focusRulePrefixes: ["no-raw-tailwind"] }
    );

    expect(warnings).toBeGreaterThan(0);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "no-raw-tailwind/no-raw-tailwind-classes",
          message: expect.stringContaining('Raw Tailwind value "max-w-3xl"'),
        }),
      ])
    );
  });

  // Valid cases (should pass)
  it("should allow CSS custom property tokens", async () => {
    const { warnings } = await lintFixture(
      "src/components/test.tsx",
      `export const Component = () => <div className="bg-[hsl(var(--color-primary))] h-[var(--size-icon-md)]" />;`,
      { focusRulePrefixes: ["no-raw-tailwind"] }
    );

    expect(warnings).toBe(0);
  });

  it("should allow semantic utilities from theme", async () => {
    const { warnings } = await lintFixture(
      "src/components/test.tsx",
      `export const Component = () => <div className="bg-primary text-foreground border-input rounded-md h-full w-full" />;`,
      { focusRulePrefixes: ["no-raw-tailwind"] }
    );

    expect(warnings).toBe(0);
  });

  it("should allow structural utilities", async () => {
    const { warnings } = await lintFixture(
      "src/components/test.tsx",
      `export const Component = () => <div className="flex grid items-center justify-between" />;`,
      { focusRulePrefixes: ["no-raw-tailwind"] }
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
      { focusRulePrefixes: ["no-raw-tailwind"] }
    );

    expect(warnings).toBe(0);
  });

  it("should exempt vendor components", async () => {
    const { warnings } = await lintFixture(
      "src/components/vendor/test.tsx",
      `export const VendorComponent = () => <div className="bg-red-500 h-12 text-4xl shadow-lg" />;`,
      { focusRulePrefixes: ["no-raw-tailwind"] }
    );

    expect(warnings).toBe(0);
  });

  // Test Group 8: Spacing / positioning / z-index / opacity
  it("should catch spacing, positioning, z-index, and opacity utilities", async () => {
    const { warnings, messages } = await lintFixture(
      "src/components/test.tsx",
      `export const Component = () => <div className="p-4 px-2 py-1 m-6 gap-2 space-x-4 space-y-1 top-4 inset-y-1 left-1/2 z-50 opacity-0 opacity-80" />;`,
      { focusRulePrefixes: ["no-raw-tailwind"] }
    );

    expect(warnings).toBeGreaterThan(0);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "no-raw-tailwind/no-raw-tailwind-classes",
          message: expect.stringContaining('Raw Tailwind value "p-4"'),
        }),
      ])
    );
  });

  // Test Group 9: Ring / ring-offset semantics vs raw
  it("should block raw ring utilities but allow semantic ones", async () => {
    const { warnings: blockedWarnings, messages: blockedMessages } =
      await lintFixture(
        "src/components/test.tsx",
        `export const Component = () => <div className="ring-2 ring-red-500 ring-offset-2 ring-offset-slate-200" />;`,
        { focusRulePrefixes: ["no-raw-tailwind"] }
      );

    expect(blockedWarnings).toBeGreaterThan(0);
    expect(blockedMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "no-raw-tailwind/no-raw-tailwind-classes",
          message: expect.stringContaining('Raw Tailwind value "ring-2"'),
        }),
      ])
    );

    const { warnings: allowedWarnings } = await lintFixture(
      "src/components/test.tsx",
      `export const Component = () => <div className="ring-primary ring-offset-background" />;`,
      { focusRulePrefixes: ["no-raw-tailwind"] }
    );

    expect(allowedWarnings).toBe(0);
  });

  // Test Group 10: Border radius and border width - blocked cases
  it("should catch border radius and width utilities", async () => {
    const { warnings, messages } = await lintFixture(
      "src/components/test.tsx",
      `export const Component = () => <div className="rounded-3xl rounded-[10px] border-2 border-[3px]" />;`,
      { focusRulePrefixes: ["no-raw-tailwind"] }
    );

    expect(warnings).toBeGreaterThan(0);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "no-raw-tailwind/no-raw-tailwind-classes",
          message: expect.stringContaining('Raw Tailwind value "rounded-3xl"'),
        }),
      ])
    );
  });

  // Test Group 11: Border radius and border width - allowed semantic cases
  it("should allow semantic border radius utilities", async () => {
    const { warnings } = await lintFixture(
      "src/components/test.tsx",
      `export const Component = () => <div className="rounded-md rounded-full rounded-tl-sm" />;`,
      { focusRulePrefixes: ["no-raw-tailwind"] }
    );

    expect(warnings).toBe(0);
  });

  // Test Group 12: Transforms + transitions (numeric)
  it("should catch transform and transition utilities", async () => {
    const { warnings, messages } = await lintFixture(
      "src/components/test.tsx",
      `export const Component = () => <div className="scale-95 scale-100 rotate-3 translate-y-1 skew-y-6 duration-150 delay-300 hover:scale-95 -translate-x-2" />;`,
      { focusRulePrefixes: ["no-raw-tailwind"] }
    );

    expect(warnings).toBeGreaterThan(0);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "no-raw-tailwind/no-raw-tailwind-classes",
          message: expect.stringContaining('Raw Tailwind value "scale-95"'),
        }),
      ])
    );
  });

  // Test Group 13: Typography spacing
  it("should catch typography spacing utilities", async () => {
    const { warnings, messages } = await lintFixture(
      "src/components/test.tsx",
      `export const Component = () => <div className="leading-7 leading-[1.4] tracking-wide tracking-[0.25em]" />;`,
      { focusRulePrefixes: ["no-raw-tailwind"] }
    );

    expect(warnings).toBeGreaterThan(0);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "no-raw-tailwind/no-raw-tailwind-classes",
          message: expect.stringContaining('Raw Tailwind value "leading-7"'),
        }),
      ])
    );
  });

  // Test Group 14: Flex / basis / grow / shrink / grid
  it("should catch flex, basis, grid utilities", async () => {
    const { warnings, messages } = await lintFixture(
      "src/components/test.tsx",
      `export const Component = () => <div className="basis-1/2 basis-[10rem] flex-[2] shrink-0 grid-cols-3 grid-rows-[auto_1fr_auto] col-span-2 row-start-3" />;`,
      { focusRulePrefixes: ["no-raw-tailwind"] }
    );

    expect(warnings).toBeGreaterThan(0);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "no-raw-tailwind/no-raw-tailwind-classes",
          message: expect.stringContaining('Raw Tailwind value "basis-1/2"'),
        }),
      ])
    );
  });

  // Test Group 15: Scroll / columns / clamp
  it("should catch misc layout scale utilities", async () => {
    const { warnings, messages } = await lintFixture(
      "src/components/test.tsx",
      `export const Component = () => <div className="scroll-mt-24 scroll-px-4 columns-3 columns-[16rem] line-clamp-3" />;`,
      { focusRulePrefixes: ["no-raw-tailwind"] }
    );

    expect(warnings).toBeGreaterThan(0);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "no-raw-tailwind/no-raw-tailwind-classes",
          message: expect.stringContaining('Raw Tailwind value "scroll-mt-24"'),
        }),
      ])
    );
  });

  // Test Group 16: Arbitrary values beyond aspect
  it("should catch arbitrary value utilities", async () => {
    const { warnings, messages } = await lintFixture(
      "src/components/test.tsx",
      `export const Component = () => <div className="w-[2px] h-[3.5rem] translate-y-[10px] text-[0.875rem] tracking-[0.2em]" />;`,
      { focusRulePrefixes: ["no-raw-tailwind"] }
    );

    expect(warnings).toBeGreaterThan(0);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "no-raw-tailwind/no-raw-tailwind-classes",
          message: expect.stringContaining(
            'Raw arbitrary value not allowed. Use bracketed tokens with var(--token) syntax. In "w-[2px]"'
          ),
        }),
      ])
    );
  });

  // Test Group 17: Min/max height/width explicitly
  it("should catch min/max height and width utilities", async () => {
    const { warnings, messages } = await lintFixture(
      "src/components/test.tsx",
      `export const Component = () => <div className="min-h-[50vh] max-h-96 min-w-0 max-w-[90ch]" />;`,
      { focusRulePrefixes: ["no-raw-tailwind"] }
    );

    expect(warnings).toBeGreaterThan(0);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "no-raw-tailwind/no-raw-tailwind-classes",
          message: expect.stringContaining(
            'Raw arbitrary value not allowed. Use bracketed tokens with var(--token) syntax. In "min-h-[50vh]"'
          ),
        }),
      ])
    );
  });

  // Test Group 18: Filters / backdrop filters / drop shadow
  it("should catch filter and backdrop-filter utilities", async () => {
    const { warnings, messages } = await lintFixture(
      "src/components/test.tsx",
      `export const Component = () => <div className="blur-sm backdrop-blur-md brightness-125 contrast-125 drop-shadow-lg" />;`,
      { focusRulePrefixes: ["no-raw-tailwind"] }
    );

    expect(warnings).toBeGreaterThan(0);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "no-raw-tailwind/no-raw-tailwind-classes",
          message: expect.stringContaining('Raw Tailwind value "blur-sm"'),
        }),
      ])
    );
  });

  // Test Group 19: Stroke / fill numeric + palettes
  it("should catch stroke and fill utilities", async () => {
    const { warnings } = await lintFixture(
      "src/components/test.tsx",
      `export const Component = () => <svg className="stroke-2 stroke-red-500 fill-slate-700" />;`,
      { focusRulePrefixes: ["no-raw-tailwind"] }
    );

    expect(warnings).toBeGreaterThan(0);
  });

  // Test Group 20: Divide / border-x / border-y width utilities
  it("should catch divide and directional border width utilities", async () => {
    const { warnings } = await lintFixture(
      "src/components/test.tsx",
      `export const Component = () => <div className="divide-x-2 divide-y-4 border-x-2 border-y-[3px]" />;`,
      { focusRulePrefixes: ["no-raw-tailwind"] }
    );

    expect(warnings).toBeGreaterThan(0);
  });

  // Test Group 21: Outline width / offset
  it("should catch outline width and offset utilities", async () => {
    const { warnings } = await lintFixture(
      "src/components/test.tsx",
      `export const Component = () => <button className="outline-2 outline-offset-4" />;`,
      { focusRulePrefixes: ["no-raw-tailwind"] }
    );

    expect(warnings).toBeGreaterThan(0);
  });

  // Test Group 22: Semantic text and prose utilities (should be allowed)
  it("should allow standard Tailwind text and prose utilities", async () => {
    const { warnings } = await lintFixture(
      "src/components/test.tsx",
      `export const Component = () => (
        <div className="text-sm text-base text-lg text-xl text-2xl text-3xl text-4xl prose-sm prose-base prose-lg prose-xl text-transparent" />
      );`,
      { focusRulePrefixes: ["no-raw-tailwind"] }
    );

    expect(warnings).toBe(0);
  });

  // Validation Test 1: File scoping - should only flag className violations, not SVG paths or token arrays
  it("should only flag className violations with proper file scoping", async () => {
    // Test SVG path in non-UI file (should be ignored)
    const { warnings: svgWarnings } = await lintFixture(
      "src/utils/svg.ts", // Outside target directories
      `export const path = "M10 20 C20 20, 20 10, 10 10 C0 10, 0 20, 10 20 z";
       export const numbers = ["1-2.235", "chart-1", "chart-2"];`,
      { focusRulePrefixes: ["no-raw-tailwind"] }
    );
    expect(svgWarnings).toBe(0);

    // Test token array in theme.ts (should be ignored due to filename filtering)
    const { warnings: themeWarnings } = await lintFixture(
      "src/styles/theme.ts",
      `export const colorKeys = ["chart-1", "chart-2", "chart-3"] as const;`,
      { focusRulePrefixes: ["no-raw-tailwind"] }
    );
    expect(themeWarnings).toBe(0);

    // Test real className violation in UI file (should be flagged)
    const { warnings: uiWarnings, messages } = await lintFixture(
      "src/components/test.tsx",
      `export const Component = () => <div className="w-4" />;`,
      { focusRulePrefixes: ["no-raw-tailwind"] }
    );
    expect(uiWarnings).toBeGreaterThan(0);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("w-4"),
          ruleId: "no-raw-tailwind/no-raw-tailwind-classes",
        }),
      ])
    );
  });

  // Validation Test 2: Complex string extraction
  it("should extract strings from complex className expressions", async () => {
    const { warnings, messages } = await lintFixture(
      "src/components/test.tsx",
      `import { cn } from "@/lib/utils";
       export const Component = ({ cond, t }: any) => (
         <div className={cn(["w-4", cond && "h-8"], \`bg-red-500 \${t}\`)} />
       );`,
      { focusRulePrefixes: ["no-raw-tailwind"] }
    );

    expect(warnings).toBeGreaterThan(0);
    // Should flag all three violations: w-4, h-8, bg-red-500
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("w-4"),
          ruleId: "no-raw-tailwind/no-raw-tailwind-classes",
        }),
        expect.objectContaining({
          message: expect.stringContaining("h-8"),
          ruleId: "no-raw-tailwind/no-raw-tailwind-classes",
        }),
        expect.objectContaining({
          message: expect.stringContaining("bg-red-500"),
          ruleId: "no-raw-tailwind/no-raw-tailwind-classes",
        }),
      ])
    );
    expect(messages.length).toBeGreaterThanOrEqual(3);
  });

  // Tests for patterns that SHOULD pass but currently fail (linting logic violations)
  // These tests document what our rule should allow per the UI architecture goals

  it("SHOULD allow semantic aliases with opacity (currently fails)", async () => {
    const { warnings, messages } = await lintFixture(
      "src/components/test.tsx",
      `export const Component = () => <div className="bg-primary/80 text-muted/60 border-accent/20" />;`,
      { focusRulePrefixes: ["no-raw-tailwind"] }
    );

    // This test expects NO warnings - these should be allowed
    // Currently fails because rule doesn't recognize semantic aliases with opacity
    expect(warnings).toBe(0);
    expect(messages).toEqual([]);
  });

  it("SHOULD allow selector utilities with zero/alias (currently fails)", async () => {
    const { warnings, messages } = await lintFixture(
      "src/components/test.tsx",
      `export const Component = () => <div className="has-[>svg]:pl-0 has-[.active]:bg-primary" />;`,
      { focusRulePrefixes: ["no-raw-tailwind"] }
    );

    // This test expects NO warnings - selector + zero + alias should be allowed
    expect(warnings).toBe(0);
    expect(messages).toEqual([]);
  });

  it("SHOULD block selector utilities with raw numeric values", async () => {
    const { warnings, messages } = await lintFixture(
      "src/components/test.tsx",
      `export const Component = () => <div className="has-[>svg]:pl-2" />;`,
      { focusRulePrefixes: ["no-raw-tailwind"] }
    );

    // This test expects warnings - raw numeric spacing should be blocked
    expect(warnings).toBeGreaterThan(0);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "no-raw-tailwind/no-raw-tailwind-classes",
          message: expect.stringContaining('Raw Tailwind value "pl-2"'),
        }),
      ])
    );
  });

  it("SHOULD allow selector utilities with bracketed tokens", async () => {
    const { warnings, messages } = await lintFixture(
      "src/components/test.tsx",
      `export const Component = () => <div className="has-[>svg]:pl-[var(--space-sm)]" />;`,
      { focusRulePrefixes: ["no-raw-tailwind"] }
    );

    // This test expects NO warnings - selector + bracketed token should be allowed
    expect(warnings).toBe(0);
    expect(messages).toEqual([]);
  });

  it("SHOULD block hand-typed min()/calc() expressions (currently works)", async () => {
    const { warnings, messages } = await lintFixture(
      "src/components/test.tsx",
      `export const Component = () => <div className="min-w-[min(100%,48ch)] w-[calc(100%-2rem)] max-w-[min(100%,80ch)]" />;`,
      { focusRulePrefixes: ["no-raw-tailwind"] }
    );

    // This test expects warnings - hand-typed math should be blocked
    // Design: use semantic alias min-w-measure instead
    expect(warnings).toBeGreaterThan(0);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "no-raw-tailwind/no-raw-tailwind-classes",
          message: expect.stringContaining("Raw arbitrary value not allowed"),
        }),
      ])
    );
  });

  it("SHOULD allow bracketed token references (currently fails for some)", async () => {
    const { warnings, messages } = await lintFixture(
      "src/components/test.tsx",
      `export const Component = () => <div className="text-[var(--chart-6)] bg-[var(--primary)] w-[var(--width-sidebar)]" />;`,
      { focusRulePrefixes: ["no-raw-tailwind"] }
    );

    // This test expects NO warnings - bracketed var() tokens should always be allowed
    // Currently may fail if tokens don't exist in CSS file
    expect(warnings).toBe(0);
    expect(messages).toEqual([]);
  });

  it("SHOULD allow important modifier with tokens (currently fails)", async () => {
    const { warnings, messages } = await lintFixture(
      "src/components/test.tsx",
      `export const Component = () => <div className="!text-[var(--foreground)] !bg-primary/80" />;`,
      { focusRulePrefixes: ["no-raw-tailwind"] }
    );

    // This test expects NO warnings - important + tokens/aliases should be allowed
    // Currently fails because rule doesn't strip ! before checking patterns
    expect(warnings).toBe(0);
    expect(messages).toEqual([]);
  });

  it("SHOULD allow CSS keywords for paint properties (currently fails)", async () => {
    const { warnings, messages } = await lintFixture(
      "src/components/test.tsx",
      `export const Component = () => <div className="text-transparent bg-current border-transparent" />;`,
      { focusRulePrefixes: ["no-raw-tailwind"] }
    );

    // This test expects NO warnings - CSS keywords should be allowed
    // Currently fails because rule doesn't recognize CSS keyword exceptions
    expect(warnings).toBe(0);
    expect(messages).toEqual([]);
  });
});
