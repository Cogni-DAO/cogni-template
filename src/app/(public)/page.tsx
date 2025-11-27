// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/page`
 * Purpose: Homepage with hero section and feature showcase.
 * Scope: Renders landing page content using feature components. Does not handle routing.
 * Invariants: Responsive design; uses Hero layout component.
 * Side-effects: none
 * Notes: Composes Hero with feature-specific content components.
 * Links: src/components/kit/sections/Hero.tsx, src/features/home/components/*
 * @public
 */

import { cva } from "class-variance-authority";
import { ArrowRight } from "lucide-react";
import type { ReactElement } from "react";

import { Button } from "@/components";

// Hero button with badges layout (page-specific)
const heroButtonWithBadges = cva(
  "flex flex-col items-center gap-[var(--spacing-lg)]"
);

import { FeaturesSection } from "@/features/home/components/FeaturesSection";
import { HeroContent } from "@/features/home/components/HeroContent";
import { HomeCtaSection } from "@/features/home/components/HomeCtaSection";
import { HomeHeroSection } from "@/features/home/components/HomeHeroSection";
import {
  type KpiBadgeProps,
  KpiBadgeRow,
} from "@/features/home/components/KpiBadge";
import { Terminal } from "@/features/home/components/Terminal";

const kpiBadges: KpiBadgeProps[] = [
  {
    kind: "external-image",
    imageSrc:
      "https://sonarcloud.io/api/project_badges/measure?project=cogni-dao_cogni-template&metric=coverage",
    imageAlt: "Test coverage",
    href: "https://sonarcloud.io/summary/new_code?id=cogni-dao_cogni-template",
  },
  {
    kind: "external-image",
    imageSrc:
      "https://sonarcloud.io/api/project_badges/measure?project=cogni-dao_cogni-template&metric=alert_status",
    imageAlt: "Quality gate status",
    href: "https://sonarcloud.io/summary/new_code?id=cogni-dao_cogni-template",
  },
];

export default function HomePage(): ReactElement {
  return (
    <main>
      <HomeHeroSection
        textContent={<HeroContent />}
        buttonContent={
          <div className={heroButtonWithBadges()}>
            <a
              href="https://github.com/cogni-template/cogni-template"
              target="_blank"
              rel="noopener"
            >
              <Button size="lg" variant="outline" rightIcon={<ArrowRight />}>
                Launch Your Own
              </Button>
            </a>
            <KpiBadgeRow badges={kpiBadges} />
          </div>
        }
        visualContent={<Terminal />}
      />
      <FeaturesSection />
      <HomeCtaSection />
    </main>
  );
}
