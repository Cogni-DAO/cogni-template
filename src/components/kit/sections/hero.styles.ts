// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0

/**
 * Purpose: CVA styling factories for Hero component layout patterns.
 * Scope: Provides hero-specific responsive layout classes. Does not handle content styling.
 * Invariants: All classes use Tailwind utilities; maintains responsive breakpoint consistency.
 * Side-effects: none
 * Notes: Hero-specific layout patterns that aren't generic enough for global styles/ui.
 * Links: src/components/kit/sections/Hero.tsx
 * @public
 */

import { cva } from "class-variance-authority";

/**
 * Hero content text wrapper with responsive alignment and max-width
 */
export const heroTextWrapper = cva(
  "sm:text-center md:mx-auto md:max-w-2xl lg:col-span-6 lg:text-left"
);

/**
 * Hero button container with responsive positioning and text alignment
 */
export const heroButtonContainer = cva(
  "mt-8 sm:mx-auto sm:max-w-lg sm:text-center lg:mx-0 lg:text-left"
);

/**
 * Hero visual container with responsive grid positioning and flex behavior
 */
export const heroVisualContainer = cva(
  "relative mt-12 sm:mx-auto sm:max-w-lg lg:col-span-6 lg:mx-0 lg:mt-0 lg:flex lg:max-w-none lg:items-center"
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
export const smallIcon = cva("h-6 w-6");
