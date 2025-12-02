// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/home/components/HomeStats`
 * Purpose: Typographic stats row for homepage.
 * Scope: Renders a row of key metrics. Does not fetch data.
 * Invariants: Responsive grid/flex layout.
 * Side-effects: none
 * Notes: "Stats-first" feel - big value, small label.
 * Links: src/app/(public)/page.tsx
 * @public
 */

import type { ReactElement } from "react";

import { cn } from "@/shared/util/cn";

interface StatItem {
  value: string;
  label: string;
}

const STATS: StatItem[] = [
  { value: "25T", label: "Monthly Tokens" },
  { value: "5M+", label: "Global Users" },
  { value: "60+", label: "Active Providers" },
  { value: "300+", label: "Models" },
];

const TEXT_CENTER = "text-center";

export function HomeStats(): ReactElement {
  return (
    <section className="w-full border-border border-t bg-background py-12 md:py-16">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-4 sm:px-6 lg:grid-cols-4">
        {STATS.map((stat) => (
          <div
            key={stat.label}
            className={cn("flex flex-col items-center", TEXT_CENTER)}
          >
            <span className="font-bold text-4xl text-foreground tracking-tight sm:text-5xl">
              {stat.value}
            </span>
            <span className="mt-2 font-medium text-muted-foreground text-sm uppercase tracking-wider">
              {stat.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
