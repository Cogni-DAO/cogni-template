// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@components/kit/typography/HeroActionWords`
 * Purpose: Kit wrapper for animated flip words in hero sections.
 * Scope: Renders animated action words. Does not handle text content.
 * Invariants: Uses FlipWords primitive; no className prop; styled via CVA.
 * Side-effects: none
 * Notes: Wrapper for FlipWords with hero-specific styling.
 * Links: src/components/vendor/ui-primitives/shadcn/flip-words.tsx
 * @public
 */

"use client";

import type { ReactElement } from "react";

import { FlipWords } from "@/components/vendor/ui-primitives/shadcn";
import { heroActionWords } from "@/styles/ui";

interface HeroActionWordsProps {
  actions: string[];
  /**
   * Time each action stays visible.
   * Default ~1s to match hero rhythm.
   */
  durationMs?: number;
}

export function HeroActionWords({
  actions,
  durationMs = 1000,
}: HeroActionWordsProps): ReactElement {
  return (
    <FlipWords
      words={actions}
      duration={durationMs}
      className={heroActionWords()}
    />
  );
}
