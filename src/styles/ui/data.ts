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
  sm: "size-6",
  md: "size-8",
  lg: "size-12",
  xl: "size-16",
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
  elevated: "shadow-lg",
  interactive: "cursor-pointer transition-shadow hover:shadow-md",
} as const;

/**
 * Card container styling with elevation variants
 */
export const card = cva(
  "rounded-lg border bg-card text-card-foreground shadow-sm",
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
export const cardHeader = cva("flex flex-col space-y-1.5 p-6");

/**
 * Card content styling with proper padding
 */
export const cardContent = cva("p-6 pt-0");

/**
 * Card footer styling with border and spacing
 */
export const cardFooter = cva("flex items-center p-6 pt-0");

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
  sm: "px-1.5 py-0.5 text-xs",
  md: "px-2.5 py-0.5 text-xs",
  lg: "px-3 py-1 text-sm",
  xl: "px-4 py-1.5 text-base",
} satisfies Record<SizeKey, string>;

/**
 * Badge component styling for status indicators
 */
export const badge = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
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
  sm: "h-8 w-8",
  md: "h-12 w-12",
  lg: "h-16 w-16",
  xl: "h-20 w-20",
} satisfies Record<SizeKey, string>;

const iconBoxColorVariants = {
  orange: "bg-orange-500",
  blue: "bg-blue-500",
  green: "bg-green-500",
  red: "bg-red-500",
} as const;

/**
 * Icon box styling for feature icons
 */
export const iconBox = cva(
  "flex items-center justify-center rounded-md text-white",
  {
    variants: {
      size: iconBoxSizeVariants,
      color: iconBoxColorVariants,
    },
    defaultVariants: { size: "md", color: "orange" },
  }
);

// Export variant types for external use
export type BadgeIntent = VariantProps<typeof badge>["intent"];
