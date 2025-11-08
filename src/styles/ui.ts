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

import { cva, type VariantProps } from "class-variance-authority";

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
      intent: {
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
    } as const,
    defaultVariants: {
      intent: "default",
      size: "md",
    },
  }
);

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
  } as const,
  defaultVariants: {
    size: "md",
    tone: "subdued",
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
 * Terminal frame styling for code display and interactive terminals
 */
export const terminalFrame = cva("rounded-lg shadow-lg font-mono", {
  variants: {
    surface: {
      default: "bg-card text-card-foreground",
      inverse: "bg-primary text-primary-foreground",
    },
    size: {
      sm: "text-xs",
      md: "text-sm",
      lg: "text-base",
    },
  },
  defaultVariants: {
    surface: "inverse",
    size: "md",
  },
} as const);

/**
 * Terminal dot styling for window controls
 */
export const terminalDot = cva("h-3 w-3 rounded-full", {
  variants: {
    color: {
      red: "bg-red-500",
      yellow: "bg-amber-500",
      green: "bg-green-500",
    },
  } as const,
  defaultVariants: {
    color: "red",
  },
});

/**
 * Terminal body styling for content area
 */
export const terminalBody = cva("p-4 space-y-2");

/**
 * Icon button styling for interactive icons
 */
export const iconButton = cva(
  "text-muted-foreground hover:text-foreground transition-colors"
);

/**
 * Icon sizing variants for consistent icon dimensions
 */
export const icon = cva("", {
  variants: {
    size: {
      sm: "h-4 w-4",
      md: "h-5 w-5",
      lg: "h-6 w-6",
      xl: "h-8 w-8",
    },
  } as const,
  defaultVariants: {
    size: "md",
  },
});

/**
 * Reveal animation styling for progressive disclosure patterns
 */
export const reveal = cva("transition-opacity", {
  variants: {
    state: {
      hidden: "opacity-0",
      visible: "opacity-100",
    },
    duration: {
      fast: "duration-150",
      normal: "duration-300",
      slow: "duration-500",
    },
    delay: {
      none: "",
      d150: "delay-150",
      d300: "delay-300",
      d450: "delay-450",
    },
  } as const,
  defaultVariants: {
    state: "visible",
    duration: "normal",
    delay: "none",
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

// Export variant types for external use
export type ButtonSize = VariantProps<typeof button>["size"];
export type BadgeIntent = VariantProps<typeof badge>["intent"];
export type ContainerSize = VariantProps<typeof container>["size"];
export type HeadingLevel = VariantProps<typeof heading>["level"];
