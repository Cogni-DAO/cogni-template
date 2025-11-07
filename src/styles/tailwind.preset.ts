// SPDX-License-Identifier: Polyform-Shield-1.0.0

/**
 * Purpose: TypeScript mirrors of CSS design tokens for type-safe Tailwind CSS usage and token validation.
 * Scope: Provides typed token names for colors, radius, fonts. Does not define actual CSS values or styles.
 * Invariants: CSS is source of truth; all tokens reference CSS custom properties; maintains type safety for design system.
 * Side-effects: none
 * Notes: All actual values defined in src/app/globals.css; provides const assertions for strict typing.
 * Links: Design token specification, Tailwind CSS configuration
 * @public
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
