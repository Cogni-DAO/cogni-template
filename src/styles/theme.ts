// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@styles/theme`
 * Purpose: Design token keys and types for type-safe component styling. No values - CSS is source of truth.
 * Scope: Provides typed token names for spacing, radius, colors. Does not define CSS values or styles.
 * Invariants: Keys match CSS custom properties; all values remain in tailwind.css; maintains strict typing.
 * Side-effects: none
 * Notes: Single source of typed keys for ui.ts and kit components. tailwind.preset.ts may import to avoid duplication.
 * Links: src/styles/tailwind.css (values), docs/UI_IMPLEMENTATION_GUIDE.md
 * @public
 */

// Color token keys (match CSS custom properties in tailwind.css)
export const colorKeys = [
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

// Radius token keys (semantic keys for CVA props - map to CSS vars)
export const radiusKeys = ["none", "sm", "md", "lg", "xl", "full"] as const;

// Semantic spacing keys (for CVA props - map to spacing scale)
export const spacingSemanticKeys = [
  "none",
  "xs",
  "sm",
  "md",
  "lg",
  "xl",
] as const;

// Size token keys (common component sizes)
export const sizeKeys = ["sm", "md", "lg", "xl"] as const;

// Type definitions
export type ColorKey = (typeof colorKeys)[number];
export type RadiusKey = (typeof radiusKeys)[number];
export type SpacingSemanticKey = (typeof spacingSemanticKeys)[number];
export type SizeKey = (typeof sizeKeys)[number];

// Font family keys (match tailwind.css font definitions)
export const fontFamilyKeys = ["sans", "mono", "display"] as const;
export type FontFamilyKey = (typeof fontFamilyKeys)[number];

// Font weight keys (common font weights)
export const fontWeightKeys = ["regular", "medium", "bold"] as const;
export type FontWeightKey = (typeof fontWeightKeys)[number];

// Duration keys (animation/transition timing)
export const durationKeys = ["fast", "normal", "slow"] as const;
export type DurationKey = (typeof durationKeys)[number];

// Z-index keys (layering hierarchy)
export const zIndexKeys = ["base", "overlay", "modal"] as const;
export type ZIndexKey = (typeof zIndexKeys)[number];

// Status color keys (for semantic state indicators)
export const statusKeys = ["danger", "warning", "success"] as const;
export type StatusKey = (typeof statusKeys)[number];

// Icon size keys (for consistent icon sizing)
export const iconSizeKeys = ["sm", "md", "lg"] as const;
export type IconSizeKey = (typeof iconSizeKeys)[number];
