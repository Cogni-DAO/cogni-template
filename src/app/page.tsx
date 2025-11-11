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

import { ArrowRight } from "lucide-react";
import type { ReactElement } from "react";

import { Button } from "@/components";
import { FeaturesSection } from "@/features/home/components/FeaturesSection";
import { HeroContent } from "@/features/home/components/HeroContent";
import { HomeCtaSection } from "@/features/home/components/HomeCtaSection";
import { HomeHeroSection } from "@/features/home/components/HomeHeroSection";
import { Terminal } from "@/features/home/components/Terminal";

export default function HomePage(): ReactElement {
  return (
    <main>
      <HomeHeroSection
        textContent={<HeroContent />}
        buttonContent={
          <a
            href="https://github.com/cogni-template/cogni-template"
            target="_blank"
          >
            <Button size="lg" variant="outline" rightIcon={<ArrowRight />}>
              Launch Your Own
            </Button>
          </a>
        }
        visualContent={<Terminal />}
      />
      <FeaturesSection />
      <HomeCtaSection />
    </main>
  );
}
