// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@styles/ui/layout`
 * Purpose: Layout component styling factories.
 * Scope: Provides CVA factories for layout and spacing components. Does not handle responsive breakpoint logic.
 * Invariants: All variants use design tokens; factories return valid Tailwind class strings; maintains responsive patterns.
 * Side-effects: none
 * Notes: Responsive variants follow mobile-first approach with consistent spacing scale.
 * Links: docs/UI_IMPLEMENTATION_GUIDE.md
 * @public
 */

import { cva, type VariantProps } from "class-variance-authority";

import type { SizeKey, SpacingSemanticKey } from "@/styles/theme";

// Common variant patterns (DRY)
const flexAlignVariants = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
} as const;

const flexJustifyVariants = {
  start: "justify-start",
  center: "justify-center",
  between: "justify-between",
  end: "justify-end",
} as const;

const containerAllSizeVariants = {
  sm: "max-w-3xl",
  md: "max-w-5xl",
  lg: "max-w-7xl",
  xl: "max-w-screen-xl",
  full: "max-w-full",
} as const;

const spacingVariants = {
  none: "",
  xs: "py-2",
  sm: "py-8",
  md: "py-12",
  lg: "py-16",
  xl: "py-20",
} satisfies Record<SpacingSemanticKey, string>;

const gapVariants = {
  none: "",
  xs: "gap-1",
  sm: "gap-4 lg:gap-6",
  md: "gap-6 lg:gap-8",
  lg: "gap-8 lg:gap-12",
  xl: "gap-12 lg:gap-16",
} satisfies Record<SpacingSemanticKey, string>;

const paddingVariants = {
  none: "",
  xs: "p-1",
  sm: "p-2",
  md: "p-4",
  lg: "p-6",
  xl: "p-8",
} satisfies Record<SpacingSemanticKey, string>;

/**
 * Page shell styling for full-page body wrapper
 */
export const pageShell = cva(
  "bg-background text-foreground min-h-[100dvh] antialiased"
);

const pageContainerMaxWidthVariants = {
  sm: "max-w-2xl",
  md: "max-w-4xl",
  lg: "max-w-6xl",
  xl: "max-w-7xl",
} satisfies Record<SizeKey, string>;

/**
 * Page container styling for centered content with responsive max-width
 */
export const pageContainer = cva("mx-auto w-full px-4 sm:px-6 lg:px-8", {
  variants: {
    maxWidth: pageContainerMaxWidthVariants,
  },
  defaultVariants: { maxWidth: "lg" },
});

const twoColumnReverseVariants = {
  false: "",
  true: "lg:grid-flow-col-dense",
} as const;

/**
 * Two-column responsive layout with optional reverse flow
 */
export const twoColumn = cva("grid gap-8 lg:grid-cols-2 lg:items-center", {
  variants: {
    reverse: twoColumnReverseVariants,
  },
  defaultVariants: { reverse: false },
});

/**
 * Container styling for responsive layout wrappers with width and padding variants
 */
export const container = cva("mx-auto px-4 sm:px-6 lg:px-8", {
  variants: {
    size: containerAllSizeVariants,
    spacing: spacingVariants,
  },
  defaultVariants: {
    size: "lg",
    spacing: "none",
  },
});

const sectionSurfaceVariants = {
  default: "",
  card: "bg-card",
  muted: "bg-muted",
  inverse: "bg-primary text-primary-foreground",
} as const;

/**
 * Section styling for page sections with surface variants for theming
 */
export const section = cva("w-full", {
  variants: {
    surface: sectionSurfaceVariants,
  },
  defaultVariants: {
    surface: "default",
  },
});

const gridColsVariants = {
  "1": "",
  "2": "grid lg:grid-cols-2",
  "3": "grid lg:grid-cols-3",
  "4": "grid lg:grid-cols-4",
  "12": "grid lg:grid-cols-12",
} as const;

const gridAlignVariants = {
  default: "",
  center: "items-center",
} as const;

/**
 * Grid layout styling with responsive column and gap variants
 */
export const grid = cva("", {
  variants: {
    cols: gridColsVariants,
    gap: gapVariants,
    align: gridAlignVariants,
  },
  defaultVariants: {
    gap: "md",
  },
});

// Row-specific gap variants (smaller scale than grid)
const rowGapVariants = {
  none: "",
  xs: "gap-2",
  sm: "gap-3",
  md: "gap-4",
  lg: "gap-6",
  xl: "gap-8",
} satisfies Record<SpacingSemanticKey, string>;

/**
 * Row layout styling for flex containers with alignment and spacing variants
 */
export const row = cva("flex", {
  variants: {
    align: flexAlignVariants,
    justify: flexJustifyVariants,
    gap: rowGapVariants,
  },
  defaultVariants: {
    align: "center",
    justify: "start",
    gap: "none",
  },
});

/**
 * Padding utility styling for consistent spacing variants
 */
export const pad = cva("", {
  variants: {
    p: paddingVariants,
  },
  defaultVariants: {
    p: "none",
  },
});

const flexDirectionVariants = {
  row: "flex-row",
  col: "flex-col",
} as const;

const flexWrapVariants = {
  wrap: "flex-wrap",
  nowrap: "flex-nowrap",
} as const;

// Flex-specific spacing (margin-top instead of padding)
const flexSpacingVariants = {
  none: "",
  xs: "mt-2",
  sm: "mt-4",
  md: "mt-6",
  lg: "mt-8",
  xl: "mt-10",
} satisfies Record<SpacingSemanticKey, string>;

/**
 * Flex container styling with alignment and spacing variants
 */
export const flex = cva("flex", {
  variants: {
    direction: flexDirectionVariants,
    align: flexAlignVariants,
    justify: flexJustifyVariants,
    wrap: flexWrapVariants,
    spacing: flexSpacingVariants,
  },
  defaultVariants: {
    direction: "row",
    align: "start",
    justify: "start",
    wrap: "nowrap",
    spacing: "none",
  },
});

// Header-specific padding variants (y-axis only)
const headerPaddingVariants = {
  none: "",
  xs: "py-1",
  sm: "py-2",
  md: "py-4",
  lg: "py-6",
  xl: "py-8",
} satisfies Record<SpacingSemanticKey, string>;

/**
 * Header styling for site header with border, background, and padding
 */
export const header = cva("border-b border-border bg-background", {
  variants: {
    pad: headerPaddingVariants,
  },
  defaultVariants: {
    pad: "md",
  },
});

// Export variant types for external use
export type ContainerSize = VariantProps<typeof container>["size"];
