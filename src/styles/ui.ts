// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0

/**
 * Purpose: Centralized styling API using CVA factories for design token enforcement and type-safe variants.
 * Scope: Provides all component styling via typed factories. Does not handle CSS-in-JS or runtime theme switching.
 * Invariants: All variants use design tokens; factories return valid Tailwind class strings; TypeScript enforces variant types.
 * Side-effects: none
 * Notes: Single source of truth for component styling; ESLint blocks literal className outside this file.
 * Links: docs/STYLEGUIDE_UI.md, src/styles/tailwind.preset.ts
 * @public
 */

import { cva } from "class-variance-authority";

/**
 * Avatar component styling with consistent sizing variants
 */
export const avatar = cva(
  "relative flex shrink-0 overflow-hidden rounded-full",
  {
    variants: {
      size: {
        sm: "size-6",
        md: "size-8",
        lg: "size-12",
        xl: "size-16",
      },
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

/**
 * Button component styling with design system variants
 */
export const button = cva(
  "inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-9 px-4 py-2",
        lg: "h-10 px-8",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

/**
 * Card container styling with elevation variants
 */
export const card = cva(
  "rounded-lg border bg-card text-card-foreground shadow-sm",
  {
    variants: {
      variant: {
        default: "",
        elevated: "shadow-lg",
        interactive: "cursor-pointer transition-shadow hover:shadow-md",
      },
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

/**
 * Badge component styling for status indicators
 */
export const badge = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80",
        outline: "text-foreground",
      },
      size: {
        sm: "px-1.5 py-0.5 text-xs",
        md: "px-2.5 py-0.5 text-xs",
        lg: "px-3 py-1 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);
