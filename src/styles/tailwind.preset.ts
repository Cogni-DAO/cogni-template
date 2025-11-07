/**
 * TypeScript mirrors of CSS design tokens
 *
 * NOTE: CSS is the source of truth for all design tokens.
 * This file only provides typed token names for TypeScript usage.
 * All actual values are defined in src/app/globals.css.
 */

// Color token names (no values - reference CSS variables)
export const colors = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "border",
  "input",
  "ring",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
] as const;

// Radius token names (no values - reference CSS variables)
export const radius = [
  "radius-sm",
  "radius-md",
  "radius-lg",
  "radius-xl",
] as const;

// Font token names for TypeScript typing
export const fontFamily = ["sans"] as const;

// Type helpers
export type ColorToken = (typeof colors)[number];
export type RadiusToken = (typeof radius)[number];
export type FontFamilyToken = (typeof fontFamily)[number];
