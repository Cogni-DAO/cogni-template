// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@styles/ui/code`
 * Purpose: Code syntax highlighting and spacing styling factories.
 * Scope: Provides CVA factories for code token styling and layout. Does not handle component logic.
 * Invariants: All variants use design tokens; token kinds map to chart colors; maintains accessibility.
 * Side-effects: none
 * Notes: Extracted from typography.ts for better organization of code-specific styling.
 * Links: src/components/kit/typography/CodeHero.tsx, src/styles/theme.ts
 * @public
 */

import { cva } from "class-variance-authority";

const codeTokenKindVariants = {
  keyword: "!text-[var(--color-chart-6)]",
  operator: "!text-[var(--color-chart-2)]",
  variable: "!text-[var(--color-chart-5)]",
  punctuation: "!text-muted-foreground",
  parenthesis: "!text-[var(--color-chart-3)]",
  property: "!text-[var(--color-chart-1)]",
  delimiter: "!text-[var(--color-chart-4)]",
  // Aliases for hero code components
  // Same as variable
  identifier: "!text-[var(--color-chart-5)]",
  // Same as property
  accent: "!text-[var(--color-chart-1)]",
} as const;

const codeTokenSpacingRightVariants = {
  none: "",
  xs: "pr-[var(--spacing-hero-xs)]",
  xl: "pr-[var(--spacing-hero-xl)]",
  rainbow: "pr-[var(--spacing-rainbow)]",
} as const;

/**
 * Code token styling with syntax highlighting and optional right spacing
 */
export const codeToken = cva("", {
  variants: {
    kind: codeTokenKindVariants,
    spacingRight: codeTokenSpacingRightVariants,
  },
  defaultVariants: {
    kind: "keyword",
    spacingRight: "none",
  },
});

const heroCodeBlockSpacingVariants = {
  none: "",
  normal: "pt-[var(--spacing-hero-xl)]",
} as const;

/**
 * Hero code block wrapper with consistent spacing
 */
export const heroCodeBlock = cva("", {
  variants: {
    spacing: heroCodeBlockSpacingVariants,
  },
  defaultVariants: {
    spacing: "none",
  },
});

/**
 * Action words container with fixed width for hero animations
 */
export const heroActionContainer = cva(
  "inline-block w-[var(--width-action-words)]"
);
