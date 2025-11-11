// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@components/kit/sections/hero.styles`
 * Purpose: Hero-specific layout styling factories.
 * Scope: Provides responsive layout classes for Hero component. Does not handle content styling.
 * Invariants: Uses Tailwind utilities; consistent breakpoints.
 * Side-effects: none
 * Notes: Component-specific patterns not suitable for global styles.
 * Links: src/components/kit/sections/Hero.tsx
 * @public
 */

import { cva } from "class-variance-authority";

/**
 * Hero content text wrapper with responsive alignment and max-width
 */
export const heroTextWrapper = cva(
  "sm:text-center md:mx-auto md:max-w-[var(--size-container-lg)] lg:col-span-12 lg:text-left lg:mb-[var(--spacing-xl)]",
  {
    variants: {
      width: {
        auto: "",
        fixed: "[&>h1]:min-w-measure",
      },
    },
    defaultVariants: {
      width: "auto",
    },
  }
);

/**
 * Hero button container with responsive positioning and text alignment
 */
export const heroButtonContainer = cva(
  "mt-[var(--spacing-xl)] text-center -mx-[var(--spacing-xl)] sm:-mx-[var(--spacing-4xl)] md:-mx-[var(--spacing-5xl)]"
);

/**
 * Hero visual container with responsive grid positioning and flex behavior
 */
export const heroVisualContainer = cva(
  "relative mt-[var(--spacing-md-plus)] sm:mx-auto lg:col-span-12 lg:mx-auto lg:mt-0 lg:max-w-none"
);

/**
 * Feature content wrapper with top margin
 */
export const featureContent = cva("mt-[var(--spacing-lg)]");

/**
 * Feature item with responsive top margin
 */
export const featureItem = cva("mt-[var(--spacing-2xl)] lg:mt-0");

/**
 * Small icon sizing (for lucide icons)
 */
export const smallIcon = cva("h-[var(--size-icon-md)] w-[var(--size-icon-md)]");
