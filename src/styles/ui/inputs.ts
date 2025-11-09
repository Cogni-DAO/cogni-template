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
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive";

const buttonToneVariants = {
  default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
  destructive:
    "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
  outline:
    "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
  secondary:
    "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
  ghost:
    "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
  link: "text-primary underline-offset-4 hover:underline",
} as const;

const buttonSizeVariants = {
  sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
  md: "h-9 px-4 py-2 has-[>svg]:px-3",
  lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
  xl: "h-12 rounded-lg px-8 has-[>svg]:px-6",
} satisfies Record<SizeKey, string>;

const buttonIconVariants = { true: "size-9", false: "" } as const;

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
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] [&_svg]:size-4 [&_svg]:shrink-0";

const modeToggleToneVariants = {
  ghost: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
  outline: "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
} as const;

const modeToggleSizeVariants = {
  sm: "h-8 w-8",
  md: "h-9 w-9", 
  lg: "h-10 w-10",
  xl: "h-12 w-12",
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

// Export variant types for external use
export type ButtonVariant = VariantProps<typeof button>["variant"];
export type ButtonSize = VariantProps<typeof button>["size"];
export type ModeToggleVariant = VariantProps<typeof modeToggle>["variant"];
export type ModeToggleSize = VariantProps<typeof modeToggle>["size"];
