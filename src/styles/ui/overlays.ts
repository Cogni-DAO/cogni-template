// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@styles/ui/overlays`
 * Purpose: Overlay component styling factories (terminals, modals, dialogs).
 * Scope: Provides CVA factories for overlay and interactive surface components. Does not handle positioning logic.
 * Invariants: All variants use design tokens; factories return valid Tailwind class strings; maintains z-index hierarchy.
 * Side-effects: none
 * Notes: Terminal components serve as reference for overlay patterns.
 * Links: docs/UI_IMPLEMENTATION_GUIDE.md
 * @public
 */

import { cva } from "class-variance-authority";

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
 * Terminal header styling for window controls bar
 */
export const terminalHeader = cva("flex items-center justify-between p-4");

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
