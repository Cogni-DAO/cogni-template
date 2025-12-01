// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@styles/ui/inputs`
 * Purpose: Input component styling factories (buttons, forms, controls).
 * Scope: Provides CVA factories for interactive input components. Does not handle component logic.
 * Invariants: All variants use design tokens; factories return valid Tailwind class strings.
 * Side-effects: none
 * Notes: Based on reference repo styling with modern focus states.
 * Links: docs/UI_IMPLEMENTATION_GUIDE.md
 * @public
 */

import { cva, type VariantProps } from "class-variance-authority";

import type { SizeKey } from "@/styles/theme";

const buttonBase =
  "inline-flex items-center justify-center gap-[var(--spacing-sm)] whitespace-nowrap rounded-md text-[var(--text-sm)] font-medium transition-all disabled:pointer-events-none disabled:opacity-[var(--opacity-50)] [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-[var(--size-icon-sm)] shrink-[var(--shrink-none)] [&_svg]:shrink-[var(--shrink-none)] outline-none focus-visible:border-ring focus-visible:ring-ring/[var(--alpha-50)] focus-visible:ring-[var(--ring-width-sm)] aria-invalid:ring-destructive/[var(--alpha-20)] dark:aria-invalid:ring-destructive/[var(--alpha-40)] aria-invalid:border-destructive";

const buttonToneVariants = {
  default:
    "bg-primary text-primary-foreground shadow-[var(--shadow-xs)] hover:bg-primary/[var(--alpha-90)]",
  destructive:
    "bg-destructive text-[var(--color-white)] shadow-[var(--shadow-xs)] hover:bg-destructive/[var(--alpha-90)] focus-visible:ring-destructive/[var(--alpha-20)] dark:focus-visible:ring-destructive/[var(--alpha-40)] dark:bg-destructive/[var(--alpha-60)]",
  outline:
    "border bg-background shadow-[var(--shadow-xs)] hover:bg-accent hover:text-accent-foreground dark:bg-input/[var(--alpha-30)] dark:border-input dark:hover:bg-input/[var(--alpha-50)]",
  secondary:
    "bg-secondary text-secondary-foreground shadow-[var(--shadow-xs)] hover:bg-secondary/[var(--alpha-80)]",
  ghost: "hover:bg-accent hover:text-accent-foreground",
  link: "text-primary underline-offset-[var(--underline-offset)] hover:underline",
} as const;

const buttonSizeVariants = {
  sm: "h-[var(--size-icon-lg)] rounded-md gap-[var(--spacing-sm)] px-[var(--spacing-lg)] has-[>svg]:px-[var(--spacing-md)]",
  md: "h-[var(--size-icon-xl)] px-[var(--spacing-xl)] py-[var(--spacing-sm)] has-[>svg]:px-[var(--spacing-lg)]",
  lg: "h-[var(--size-icon-2xl)] rounded-md px-[var(--spacing-lg)] has-[>svg]:px-[var(--spacing-xl)]",
  xl: "h-[var(--size-icon-3xl)] rounded-lg px-[var(--spacing-xl)] has-[>svg]:px-[var(--spacing-lg)]",
} satisfies Record<SizeKey, string>;

const buttonIconVariants = {
  true: "size-[var(--size-icon-xl)]",
  false: "",
} as const;

/**
 * Button component styling matching reference repo with modern focus states
 */
export const button = cva(buttonBase, {
  variants: {
    variant: buttonToneVariants,
    size: buttonSizeVariants,
    icon: buttonIconVariants,
  },
  defaultVariants: { variant: "default", size: "md", icon: false },
});

const modeToggleBase =
  "inline-flex items-center justify-center rounded-md text-[var(--text-sm)] font-medium transition-all disabled:pointer-events-none disabled:opacity-[var(--opacity-50)] outline-none focus-visible:border-ring focus-visible:ring-ring/[var(--alpha-50)] focus-visible:ring-[var(--ring-width-sm)] [&_svg]:size-[var(--size-icon-sm)] [&_svg]:shrink-[var(--shrink-none)]";

const modeToggleToneVariants = {
  ghost: "hover:bg-accent hover:text-accent-foreground",
  outline:
    "border bg-background shadow-[var(--shadow-xs)] hover:bg-accent hover:text-accent-foreground dark:bg-input/[var(--alpha-30)] dark:border-input dark:hover:bg-input/[var(--alpha-50)]",
} as const;

const modeToggleSizeVariants = {
  sm: "h-[var(--size-icon-lg)] w-[var(--size-icon-lg)]",
  md: "h-[var(--size-icon-xl)] w-[var(--size-icon-xl)]",
  lg: "h-[var(--size-icon-2xl)] w-[var(--size-icon-2xl)]",
  xl: "h-[var(--size-icon-3xl)] w-[var(--size-icon-3xl)]",
} satisfies Record<SizeKey, string>;

/**
 * Mode toggle button styling for theme switching with icon-only design
 */
export const modeToggle = cva(modeToggleBase, {
  variants: {
    variant: modeToggleToneVariants,
    size: modeToggleSizeVariants,
  },
  defaultVariants: {
    variant: "ghost",
    size: "md",
  },
});

/**
 * Input component styling for text-based inputs
 */
export const input = cva(
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-[var(--text-sm)] ring-offset-background file:border-0 file:bg-transparent file:font-medium file:text-[var(--text-sm)] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
);

// Export variant types for external use
export type ButtonVariant = VariantProps<typeof button>["variant"];
export type ButtonSize = VariantProps<typeof button>["size"];
export type ModeToggleVariant = VariantProps<typeof modeToggle>["variant"];
export type ModeToggleSize = VariantProps<typeof modeToggle>["size"];
