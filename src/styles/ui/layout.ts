// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0

/**
 * Purpose: Layout component styling factories (containers, sections, grids).
 * Scope: Provides CVA factories for layout and spacing components. Does not handle responsive breakpoint logic.
 * Invariants: All variants use design tokens; factories return valid Tailwind class strings; maintains responsive patterns.
 * Side-effects: none
 * Notes: Responsive variants follow mobile-first approach with consistent spacing scale.
 * Links: docs/UI_IMPLEMENTATION_GUIDE.md
 * @public
 */

import { cva, type VariantProps } from "class-variance-authority";

/**
 * Container styling for responsive layout wrappers with width and padding variants
 */
export const container = cva("mx-auto px-4 sm:px-6 lg:px-8", {
  variants: {
    size: {
      sm: "max-w-3xl",
      md: "max-w-5xl",
      lg: "max-w-7xl",
      xl: "max-w-screen-xl",
      full: "max-w-full",
    },
    spacing: {
      none: "",
      sm: "py-8",
      md: "py-12",
      lg: "py-16",
      xl: "py-20",
    },
  } as const,
  defaultVariants: {
    size: "lg",
    spacing: "none",
  },
});

/**
 * Section styling for page sections with surface variants for theming
 */
export const section = cva("w-full", {
  variants: {
    surface: {
      default: "",
      card: "bg-card",
      muted: "bg-muted",
      inverse: "bg-primary text-primary-foreground",
    },
  } as const,
  defaultVariants: {
    surface: "default",
  },
});

/**
 * Grid layout styling with responsive column and gap variants
 */
export const grid = cva("", {
  variants: {
    cols: {
      "1": "",
      "2": "grid lg:grid-cols-2",
      "3": "grid lg:grid-cols-3",
      "4": "grid lg:grid-cols-4",
      "12": "grid lg:grid-cols-12",
    },
    gap: {
      sm: "gap-4 lg:gap-6",
      md: "gap-6 lg:gap-8",
      lg: "gap-8 lg:gap-12",
    },
    align: {
      default: "",
      center: "items-center",
    },
  } as const,
  defaultVariants: {
    gap: "md",
  },
});

/**
 * Row layout styling for flex containers with alignment and spacing variants
 */
export const row = cva("flex", {
  variants: {
    align: {
      start: "items-start",
      center: "items-center",
      end: "items-end",
    },
    justify: {
      start: "justify-start",
      between: "justify-between",
      end: "justify-end",
    },
    gap: {
      none: "",
      xs: "gap-2",
      sm: "gap-3",
      md: "gap-4",
    },
  } as const,
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
    p: {
      none: "",
      xs: "p-1",
      sm: "p-2",
      md: "p-4",
      lg: "p-6",
    },
  } as const,
  defaultVariants: {
    p: "none",
  },
});

// Export variant types for external use
export type ContainerSize = VariantProps<typeof container>["size"];
