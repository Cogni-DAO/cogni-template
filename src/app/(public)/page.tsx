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

import type { ReactElement } from "react";

import { HomeCtaSection } from "@/features/home/components/HomeCtaSection";
import { HomeStats } from "@/features/home/components/HomeStats";
import { KeyFeatures } from "@/features/home/components/KeyFeatures";
import { NewHomeHero } from "@/features/home/components/NewHomeHero";

export default function HomePage(): ReactElement {
  return (
    <div className="flex min-h-screen flex-col">
      <NewHomeHero />
      <HomeStats />
      <KeyFeatures />
      <HomeCtaSection />
    </div>
  );
}
