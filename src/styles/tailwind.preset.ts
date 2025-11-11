// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@styles/tailwind.preset`
 * Purpose: TypeScript mirrors of CSS design tokens for type-safe Tailwind CSS usage and token validation.
 * Scope: Provides typed token names for colors, radius, fonts. Does not define actual CSS values or styles.
 * Invariants: CSS is source of truth; all tokens reference CSS custom properties; maintains type safety for design system.
 * Side-effects: none
 * Notes: Colors/radius resolve via CSS custom properties; font stacks are defined here and consumed via Tailwind (e.g. font-sans in globals.css).
 * Links: Design token specification, Tailwind CSS configuration
 * @public
 */

import {
  colorKeys,
  type DropdownSizeKey,
  dropdownSizeKeys,
  type IconSizeKey,
  iconSizeKeys,
  type RadiusKey,
  radiusKeys,
  type SpacingSemanticKey,
  spacingSemanticKeys,
  statusKeys,
} from "./theme";

// Color tokens mapped to CSS custom properties for Tailwind config
export const colors = {
  ...Object.fromEntries(colorKeys.map((key) => [key, `hsl(var(--${key}))`])),
  // Status colors
  ...Object.fromEntries(
    statusKeys.map((key) => [key, `hsl(var(--color-${key}))`])
  ),
};

// Radius tokens mapped to CSS custom properties for Tailwind config
export const borderRadius = Object.fromEntries(
  radiusKeys.map((key) => [key, `var(--radius-${key})`])
) as Record<RadiusKey, string>;

// Spacing tokens mapped to CSS custom properties for Tailwind config
export const spacing = Object.fromEntries(
  spacingSemanticKeys.map((key) => [key, `var(--spacing-${key})`])
) as Record<SpacingSemanticKey, string>;

// Size tokens for icons and components
export const size = Object.fromEntries(
  iconSizeKeys.map((key) => [`icon-${key}`, `var(--size-icon-${key})`])
) as Record<`icon-${IconSizeKey}`, string>;

// Width tokens for dropdowns and components
export const width = Object.fromEntries(
  dropdownSizeKeys.map((key) => [
    `dropdown-${key}`,
    `var(--size-dropdown-${key})`,
  ])
) as Record<`dropdown-${DropdownSizeKey}`, string>;

// Typography measure utilities
export const measureUtilities = {
  ".min-w-measure": { minWidth: "min(100%, var(--measure))" },
  ".max-w-measure": { maxWidth: "min(100%, var(--measure))" },
};
