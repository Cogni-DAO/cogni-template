// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@components/kit/typography/CodeHero`
 * Purpose: Kit components and types for rendering syntax-highlighted code in hero sections.
 * Scope: Provides reusable code hero primitives. Does not handle feature-specific data.
 * Invariants: Uses CVA factories from styles/ui; no className props; maintains type safety.
 * Side-effects: none
 * Notes: Combines types and components for data-driven hero code composition.
 * Links: src/styles/ui/code.ts, src/features/home/code-hero-data.ts
 * @public
 */

import type { ReactElement, ReactNode } from "react";

import {
  codeToken,
  heading,
  heroActionContainer,
  heroCodeBlock,
} from "@/styles/ui";

// Types
export type CodeTokenKind =
  | "keyword"
  | "identifier"
  | "operator"
  | "punctuation"
  | "accent"
  | "parenthesis"
  | "property"
  | "delimiter"
  | "variable";

export type CodeTokenSpacing = "none" | "xs" | "xl" | "rainbow";

export interface CodeToken {
  id: string;
  kind: CodeTokenKind;
  text: string;
  spacingRight?: CodeTokenSpacing;
}

// Components
interface CodeHeroLineProps {
  tokens: CodeToken[];
  /**
   * Typography tone for the entire line.
   * Default uses standard foreground color.
   */
  tone?: "default" | "subdued";
}

export function CodeHeroLine({
  tokens,
  tone = "default",
}: CodeHeroLineProps): ReactElement {
  return (
    <h1
      className={heading({
        level: "h1",
        tone,
        family: "mono",
        weight: "regular",
      })}
    >
      {tokens.map((token) => (
        <span
          key={token.id}
          className={codeToken({
            kind: token.kind,
            spacingRight: token.spacingRight,
          })}
        >
          {token.text}
        </span>
      ))}
    </h1>
  );
}

interface HeroCodeBlockProps {
  children: ReactNode;
  /**
   * Additional spacing between lines.
   */
  spacing?: "none" | "normal";
}

export function HeroCodeBlock({
  children,
  spacing = "none",
}: HeroCodeBlockProps): ReactElement {
  return <div className={heroCodeBlock({ spacing })}>{children}</div>;
}

interface HeroActionContainerProps {
  children: ReactNode;
}

export function HeroActionContainer({
  children,
}: HeroActionContainerProps): ReactElement {
  return <div className={heroActionContainer()}>{children}</div>;
}

interface HeroCodeSpacingProps {
  children: ReactNode;
  spacing?: "none" | "normal";
}

export function HeroCodeSpacing({
  children,
  spacing = "none",
}: HeroCodeSpacingProps): ReactElement {
  return <div className={heroCodeBlock({ spacing })}>{children}</div>;
}
