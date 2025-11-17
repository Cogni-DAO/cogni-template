// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@components/kit/sections/HomeHeroSection`
 * Purpose: Homepage-specific hero section with single-column layout (text → button → terminal).
 * Scope: Renders home hero layout structure. Does not handle content generation.
 * Invariants: Uses layout primitives; single-column responsive design.
 * Side-effects: none
 * Notes: Composes section, container, grid layout for homepage hero pattern.
 * Links: src/styles/ui/layout.ts, src/components/kit/sections/hero.styles.ts
 * @public
 */

import { cva } from "class-variance-authority";
import type { ReactElement, ReactNode } from "react";

import { container, grid, section } from "@/components";

// Hero-specific layout styles (localized to this component)
const heroTextWrapper = cva(
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

const heroButtonContainer = cva(
  "mt-[var(--spacing-xl)] text-center -mx-[var(--spacing-xl)] sm:-mx-[var(--spacing-4xl)] md:-mx-[var(--spacing-5xl)]"
);

const heroVisualContainer = cva(
  "relative mt-[var(--spacing-md-plus)] sm:mx-auto lg:col-span-12 lg:mx-auto lg:mt-0 lg:max-w-none"
);

interface HomeHeroSectionProps {
  /**
   * Hero text content (code block and action words)
   */
  textContent: ReactNode;
  /**
   * Call-to-action button
   */
  buttonContent: ReactNode;
  /**
   * Terminal visual component
   */
  visualContent: ReactNode;
}

export function HomeHeroSection({
  textContent,
  buttonContent,
  visualContent,
}: HomeHeroSectionProps): ReactElement {
  return (
    <section className={section()}>
      <div className={container({ size: "lg", spacing: "xl" })}>
        <div className={grid({ cols: "12", gap: "md" })}>
          {/* Text content area */}
          <div className={heroTextWrapper({ width: "fixed" })}>
            {textContent}

            {/* Button area */}
            <div className={heroButtonContainer()}>{buttonContent}</div>
          </div>

          {/* Visual content area */}
          <div className={heroVisualContainer()}>{visualContent}</div>
        </div>
      </div>
    </section>
  );
}
