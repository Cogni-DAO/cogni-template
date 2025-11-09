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

import type { SizeKey } from "@/styles/theme";

const terminalFrameSurfaceVariants = {
  default: "bg-card text-card-foreground",
  inverse: "bg-primary text-primary-foreground",
} as const;

const terminalFrameSizeVariants = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
  xl: "text-lg",
} satisfies Record<SizeKey, string>;

/**
 * Terminal frame styling for code display and interactive terminals
 */
export const terminalFrame = cva("rounded-lg shadow-lg font-mono", {
  variants: {
    surface: terminalFrameSurfaceVariants,
    size: terminalFrameSizeVariants,
  },
  defaultVariants: {
    surface: "inverse",
    size: "md",
  },
} as const);

const terminalDotColorVariants = {
  red: "bg-red-500",
  yellow: "bg-amber-500",
  green: "bg-green-500",
} as const;

/**
 * Terminal dot styling for window controls
 */
export const terminalDot = cva("h-3 w-3 rounded-full", {
  variants: {
    color: terminalDotColorVariants,
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

const iconToneVariants = {
  default: "",
  primary: "text-primary",
  muted: "text-muted-foreground",
  foreground: "text-foreground",
} as const;

const iconSizeVariants = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-6 w-6",
  xl: "h-8 w-8",
} satisfies Record<SizeKey, string>;

/**
 * Icon sizing variants for consistent icon dimensions
 */
export const icon = cva("", {
  variants: {
    size: iconSizeVariants,
    tone: iconToneVariants,
  } as const,
  defaultVariants: {
    size: "md",
    tone: "default",
  },
});

const themeIconStateVariants = {
  visible: "rotate-0 scale-100",
  hidden: "rotate-90 scale-0",
} as const;

/**
 * Theme icon animation for smooth transitions in ModeToggle
 */
export const themeIcon = cva("transition-all", {
  variants: {
    state: themeIconStateVariants,
  } as const,
  defaultVariants: {
    state: "visible",
  },
});

const revealStateVariants = {
  hidden: "opacity-0",
  visible: "opacity-100",
} as const;

const revealDurationVariants = {
  fast: "duration-150",
  normal: "duration-300",
  slow: "duration-500",
} as const;

const revealDelayVariants = {
  none: "",
  d150: "delay-150",
  d300: "delay-300",
  d450: "delay-450",
} as const;

/**
 * Reveal animation styling for progressive disclosure patterns
 */
export const reveal = cva("transition-opacity", {
  variants: {
    state: revealStateVariants,
    duration: revealDurationVariants,
    delay: revealDelayVariants,
  } as const,
  defaultVariants: {
    state: "visible",
    duration: "normal",
    delay: "none",
  },
});

const navLinkSizeVariants = {
  sm: "text-sm font-medium",
  md: "text-base font-medium",
  lg: "text-lg font-medium",
  xl: "text-xl font-medium",
} satisfies Record<SizeKey, string>;

const navLinkStateVariants = {
  default: "text-muted-foreground hover:text-foreground",
  hover: "text-foreground",
  active: "text-foreground font-semibold",
} as const;

/**
 * Navigation link styling for header and menu navigation
 */
export const navLink = cva("transition-colors", {
  variants: {
    size: navLinkSizeVariants,
    state: navLinkStateVariants,
  } as const,
  defaultVariants: {
    size: "sm",
    state: "default",
  },
});

const dropdownContentSizeVariants = {
  sm: "w-32",
  md: "w-36",
  lg: "w-40",
  xl: "w-48",
} satisfies Record<SizeKey, string>;

/**
 * Dropdown menu content sizing for consistent dropdown widths
 */
export const dropdownContent = cva("", {
  variants: {
    size: dropdownContentSizeVariants,
  } as const,
  defaultVariants: {
    size: "md",
  },
});

/**
 * Dropdown menu item styling with icon and text layout
 */
export const dropdownMenuItem = cva("flex items-center gap-2");

const dropdownMenuCheckSizeVariants = {
  sm: "h-4 w-4 ml-auto",
  md: "h-5 w-5 ml-auto",
  lg: "h-6 w-6 ml-auto",
  xl: "h-8 w-8 ml-auto",
} satisfies Record<SizeKey, string>;

/**
 * Dropdown menu check icon styling with auto margin and sizing
 */
export const dropdownMenuCheck = cva("", {
  variants: {
    size: dropdownMenuCheckSizeVariants,
  } as const,
  defaultVariants: {
    size: "sm",
  },
});
