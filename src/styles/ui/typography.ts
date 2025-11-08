// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@styles/ui/typography`
 * Purpose: Typography component styling factories.
 * Scope: Provides CVA factories for text presentation components. Does not handle content processing.
 * Invariants: All variants use design tokens; factories return valid Tailwind class strings; maintains typographic hierarchy.
 * Side-effects: none
 * Notes: Typography scale follows design system hierarchy with responsive sizing.
 * Links: docs/UI_IMPLEMENTATION_GUIDE.md
 * @public
 */

import { cva, type VariantProps } from "class-variance-authority";

/**
 * Heading typography with level scale and tone variants
 */
export const heading = cva("font-bold tracking-tight", {
  variants: {
    level: {
      h1: "text-4xl sm:text-5xl md:text-6xl",
      h2: "text-3xl sm:text-4xl",
      h3: "text-xl sm:text-2xl",
      h4: "text-lg font-semibold",
      h5: "text-base font-semibold",
    },
    tone: {
      default: "text-foreground",
      subdued: "text-muted-foreground",
      invert: "text-background",
    },
  } as const,
  defaultVariants: {
    level: "h2",
    tone: "default",
  },
});

/**
 * Paragraph styling with size and tone variants
 */
export const paragraph = cva("", {
  variants: {
    size: {
      sm: "text-sm",
      md: "text-base",
      lg: "text-lg",
      xl: "text-xl",
    },
    tone: {
      default: "text-foreground",
      subdued: "text-muted-foreground",
      invert: "text-background",
    },
    spacing: {
      none: "",
      xs: "mt-1",
      sm: "mt-2",
      md: "mt-3",
      lg: "mt-4",
      xl: "mt-5",
    },
  } as const,
  defaultVariants: {
    size: "md",
    tone: "subdued",
    spacing: "none",
  },
});

/**
 * Prose styling for rich text content with size and tone variants
 */
export const prose = cva("prose", {
  variants: {
    size: {
      sm: "prose-sm",
      md: "prose-base",
      lg: "prose-lg",
      xl: "prose-xl",
    },
    tone: {
      default: "",
      invert: "prose-invert",
    },
  } as const,
  defaultVariants: {
    size: "md",
    tone: "default",
  },
});

/**
 * Terminal prompt styling with semantic tone variants
 */
export const prompt = cva("font-mono", {
  variants: {
    tone: {
      default: "text-foreground",
      success: "text-green-400",
    },
  } as const,
  defaultVariants: {
    tone: "default",
  },
});

/**
 * Accent text styling for highlighted spans
 */
export const textAccent = cva("block text-orange-500");

// Export variant types for external use
export type HeadingLevel = VariantProps<typeof heading>["level"];
