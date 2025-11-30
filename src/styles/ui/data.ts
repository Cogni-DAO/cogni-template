// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@styles/ui/data`
 * Purpose: Data display component styling factories.
 * Scope: Provides CVA factories for data presentation components. Does not handle data fetching or processing.
 * Invariants: All variants use design tokens; factories return valid Tailwind class strings; maintains elevation hierarchy.
 * Side-effects: none
 * Notes: Elevation and status variants follow design system hierarchy.
 * Links: docs/UI_IMPLEMENTATION_GUIDE.md
 * @public
 */

import { cva, type VariantProps } from "class-variance-authority";

import type { SizeKey } from "@/styles/theme";

const avatarSizeVariants = {
  sm: "size-[var(--size-icon-sm)]",
  md: "size-[var(--size-icon-lg)]",
  lg: "size-[var(--size-icon-2xl)]",
  xl: "size-[var(--size-icon-4xl)]",
} satisfies Record<SizeKey, string>;

/**
 * Avatar component styling with consistent sizing variants
 */
export const avatar = cva(
  "relative flex shrink-0 overflow-hidden rounded-full",
  {
    variants: {
      size: avatarSizeVariants,
    },
    defaultVariants: {
      size: "md",
    },
  }
);

/**
 * Avatar image styling for proper aspect ratio and sizing
 */
export const avatarImage = cva("aspect-square size-full");

/**
 * Avatar fallback styling with background and centering
 */
export const avatarFallback = cva(
  "flex size-full items-center justify-center rounded-full bg-muted"
);

const cardVariants = {
  default: "",
  elevated: "shadow-[var(--shadow-lg)]",
  interactive: "cursor-pointer transition-shadow hover:shadow-md",
} as const;

/**
 * Card container styling with elevation variants
 */
export const card = cva(
  "rounded-lg border bg-card text-card-foreground shadow-[var(--shadow-sm)]",
  {
    variants: {
      variant: cardVariants,
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

/**
 * Card header styling for consistent spacing
 */
export const cardHeader = cva(
  "flex flex-col space-y-[var(--spacing-sm)] p-[var(--spacing-lg)]"
);

/**
 * Card content styling with proper padding
 */
export const cardContent = cva("p-[var(--spacing-lg)] pt-0");

/**
 * Card footer styling with border and spacing
 */
export const cardFooter = cva("flex items-center p-[var(--spacing-lg)] pt-0");

const badgeIntentVariants = {
  default:
    "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
  secondary:
    "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
  destructive:
    "border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80",
  outline: "text-foreground",
} as const;

const badgeSizeVariants = {
  sm: "px-[var(--spacing-sm)] py-[var(--spacing-xs)] text-[var(--text-xs)]",
  md: "px-[var(--spacing-md)] py-[var(--spacing-xs)] text-[var(--text-xs)]",
  lg: "px-[var(--spacing-lg)] py-[var(--spacing-sm)] text-[var(--text-sm)]",
  xl: "px-[var(--spacing-xl)] py-[var(--spacing-sm)] text-[var(--text-base)]",
} satisfies Record<SizeKey, string>;

/**
 * Badge component styling for status indicators
 */
export const badge = cva(
  "inline-flex items-center rounded-md border px-[var(--spacing-md)] py-[var(--spacing-xs)] font-semibold text-[var(--text-xs)] transition-colors focus:outline-none focus:ring-[var(--ring-width-sm)] focus:ring-ring focus:ring-offset-[var(--ring-offset-w-sm)]",
  {
    variants: {
      intent: badgeIntentVariants,
      size: badgeSizeVariants,
    } as const,
    defaultVariants: {
      intent: "default",
      size: "md",
    },
  }
);

const iconBoxSizeVariants = {
  sm: "h-[var(--size-icon-lg)] w-[var(--size-icon-lg)]",
  md: "h-[var(--size-icon-xl)] w-[var(--size-icon-xl)]",
  lg: "h-[var(--size-icon-2xl)] w-[var(--size-icon-2xl)]",
  xl: "h-[var(--size-icon-3xl)] w-[var(--size-icon-3xl)]",
} satisfies Record<SizeKey, string>;

const iconBoxColorVariants = {
  orange: "bg-warning",
  blue: "bg-accent-blue",
  green: "bg-success",
  red: "bg-danger",
} as const;

/**
 * Icon box styling for feature icons
 */
export const iconBox = cva(
  "flex items-center justify-center rounded-md text-[var(--color-white)]",
  {
    variants: {
      size: iconBoxSizeVariants,
      color: iconBoxColorVariants,
    },
    defaultVariants: { size: "md", color: "blue" },
  }
);

/**
 * Stats display box for key metrics
 */
export const statsBox = cva("rounded-lg bg-muted p-[var(--spacing-md)]");

/**
 * Stats grid - responsive 2-column layout with top margin
 */
export const statsGrid = cva(
  "mt-[var(--spacing-sm)] grid gap-[var(--spacing-xs)] lg:grid-cols-2"
);

const ledgerListGapVariants = {
  xs: "space-y-[var(--spacing-xs)]",
  sm: "space-y-[var(--spacing-sm)]",
} as const;

const ledgerListMtVariants = {
  none: "",
  lg: "mt-[var(--spacing-lg)]",
} as const;

/**
 * Ledger list with vertical spacing and optional top margin
 */
export const ledgerList = cva("space-y-[var(--spacing-sm)]", {
  variants: {
    gap: ledgerListGapVariants,
    mt: ledgerListMtVariants,
  },
  defaultVariants: { gap: "sm", mt: "none" },
});

/**
 * Ledger entry container for transaction history
 */
export const ledgerEntry = cva(
  "flex flex-col gap-[var(--spacing-2xs)] rounded-md border border-border p-[var(--spacing-md)]"
);

/**
 * Ledger entry header row with space-between layout
 */
export const ledgerHeader = cva("flex items-center justify-between");

/**
 * Ledger metadata row with timestamp and balance info
 */
export const ledgerMeta = cva(
  "flex flex-wrap items-center gap-[var(--spacing-sm)] text-[var(--text-sm)] text-muted-foreground"
);

/**
 * Amount button grid for payment selection
 */
export const amountButtons = cva("flex flex-wrap gap-[var(--spacing-sm)]");

// Export variant types for external use
export type BadgeIntent = VariantProps<typeof badge>["intent"];
