// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0

/**
 * Purpose: Hero section component for landing pages with two-column layout.
 * Scope: Provides reusable hero section with text/visual columns. Does not handle content data.
 * Invariants: Uses only CVA factories from styles/ui; maintains responsive design; no inline Tailwind.
 * Side-effects: none
 * Notes: Composes layout primitives for hero sections. Reusable across pages.
 * Links: src/styles/ui/layout.ts
 * @public
 */

import type { ReactNode } from "react";

import { pageContainer, section, twoColumn } from "@/styles/ui";

interface HeroProps {
  textSide: ReactNode;
  visualSide: ReactNode;
  reverse?: boolean;
  maxWidth?: "md" | "lg" | "xl";
}

export function Hero({
  textSide,
  visualSide,
  reverse = false,
  maxWidth = "xl",
}: HeroProps): ReactNode {
  return (
    <section className={section()}>
      <div className={pageContainer({ maxWidth })}>
        <div className={twoColumn({ reverse })}>
          <div>{textSide}</div>
          <div>{visualSide}</div>
        </div>
      </div>
    </section>
  );
}
