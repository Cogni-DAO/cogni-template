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
  muted: "bg-muted text-muted-foreground",
  inverse: "bg-primary text-primary-foreground",
} as const;

const terminalFrameSizeVariants = {
  sm: "text-[var(--text-xs)]",
  md: "text-[var(--text-sm)]",
  lg: "text-[var(--text-base)]",
  xl: "text-[var(--text-lg)]",
} satisfies Record<SizeKey, string>;

/**
 * Terminal frame styling for code display and interactive terminals
 */
export const terminalFrame = cva(
  "rounded-lg shadow-[var(--shadow-lg)] font-mono",
  {
    variants: {
      surface: terminalFrameSurfaceVariants,
      size: terminalFrameSizeVariants,
    },
    defaultVariants: {
      surface: "muted",
      size: "md",
    },
  } as const
);

const terminalDotColorVariants = {
  red: "bg-danger",
  yellow: "bg-warning",
  green: "bg-success",
} as const;

/**
 * Terminal dot styling for window controls
 */
export const terminalDot = cva(
  "h-[var(--size-dot)] w-[var(--size-dot)] rounded-full",
  {
    variants: {
      color: terminalDotColorVariants,
    } as const,
    defaultVariants: {
      color: "red",
    },
  }
);

/**
 * Terminal header styling for window controls bar
 */
export const terminalHeader = cva(
  "flex items-center justify-between p-[var(--spacing-md)] mb-[var(--spacing-xs)]"
);

/**
 * Terminal body styling for content area
 */
export const terminalBody = cva(
  "p-[var(--spacing-md)] space-y-[var(--spacing-sm)]"
);

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
  sm: "h-[var(--size-icon-sm)] w-[var(--size-icon-sm)]",
  md: "h-[var(--size-icon-md)] w-[var(--size-icon-md)]",
  lg: "h-[var(--size-icon-lg)] w-[var(--size-icon-lg)]",
  xl: "h-[var(--size-icon-xl)] w-[var(--size-icon-xl)]",
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
  visible: "rotate-[var(--rotation-none)] scale-[var(--opacity-visible)]",
  hidden: "rotate-[var(--rotation-quarter)] scale-[var(--flex-none)]",
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
  hidden: "opacity-[var(--opacity-hidden)]",
  visible: "opacity-[var(--opacity-visible)]",
} as const;

const revealDurationVariants = {
  fast: "duration-[var(--duration-fast)]",
  normal: "duration-[var(--duration-normal)]",
  slow: "duration-[var(--duration-slow)]",
} as const;

const revealDelayVariants = {
  none: "",
  d150: "delay-[var(--delay-fast)]",
  d300: "delay-[var(--delay-normal)]",
  d450: "delay-[var(--delay-slow)]",
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
  sm: "text-[var(--text-sm)] font-medium",
  md: "text-[var(--text-base)] font-medium",
  lg: "text-[var(--text-lg)] font-medium",
  xl: "text-[var(--text-xl)] font-medium",
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
  sm: "w-[var(--size-dropdown-sm)]",
  md: "w-[var(--size-dropdown-md)]",
  lg: "w-[var(--size-dropdown-lg)]",
  xl: "w-[var(--size-dropdown-xl)]",
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
export const dropdownMenuItem = cva(
  "flex items-center gap-[var(--spacing-sm)]"
);

const dropdownMenuCheckSizeVariants = {
  sm: "h-[var(--size-icon-sm)] w-[var(--size-icon-sm)] ml-auto",
  md: "h-[var(--size-icon-md)] w-[var(--size-icon-md)] ml-auto",
  lg: "h-[var(--size-icon-lg)] w-[var(--size-icon-lg)] ml-auto",
  xl: "h-[var(--size-icon-xl)] w-[var(--size-icon-xl)] ml-auto",
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

/**
 * Skip link styling for accessibility navigation
 */
export const skipLink = cva(
  "sr-only focus:not-sr-only focus:absolute focus:top-[var(--position-sm)] focus:left-[var(--position-sm)] focus:z-[var(--z-overlay)] focus:px-[var(--position-sm)] focus:py-[var(--spacing-sm)] focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:shadow-[var(--shadow-lg)] transition-all duration-[var(--duration-fast)]"
);
