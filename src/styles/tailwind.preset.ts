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

import { colorKeys, type RadiusKey, radiusKeys } from "./theme";

// Color tokens mapped to CSS custom properties for Tailwind config
export const colors = Object.fromEntries(
  colorKeys.map((key) => [key, `hsl(var(--${key}))`])
);

// Radius tokens mapped to CSS custom properties for Tailwind config
export const borderRadius = Object.fromEntries(
  radiusKeys.map((key) => [key, `var(--radius-${key})`])
) as Record<RadiusKey, string>;
