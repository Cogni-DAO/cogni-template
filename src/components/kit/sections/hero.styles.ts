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
  "sm:text-center md:mx-auto md:max-w-4xl lg:col-span-12 lg:text-left lg:mb-8",
  {
    variants: {
      width: {
        auto: "",
        fixed: "[&>h1]:min-w-[min(100%,48ch)]",
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
  "mt-8 text-center -mx-8 sm:-mx-16 md:-mx-32"
);

/**
 * Hero visual container with responsive grid positioning and flex behavior
 */
export const heroVisualContainer = cva(
  "relative mt-3 sm:mx-auto lg:col-span-12 lg:mx-auto lg:mt-0 lg:max-w-none"
);

/**
 * Feature content wrapper with top margin
 */
export const featureContent = cva("mt-5");

/**
 * Feature item with responsive top margin
 */
export const featureItem = cva("mt-10 lg:mt-0");

/**
 * Small icon sizing (for lucide icons)
 */
export const smallIcon = cva("h-[var(--size-icon-md)] w-[var(--size-icon-md)]");
