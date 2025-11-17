// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/home/components/KpiBadge`
 * Purpose: Home-hero KPI badge rendering for Sonar/coverage metrics.
 * Scope: Provides badge + badge row components for landing content. Does not fetch data.
 * Invariants: Token-only styling via CVA; accessible images/links; layout restricted to feature usage.
 * Side-effects: none
 * Notes: Formerly a kit primitive; now feature-only to keep kit surface lean.
 * Links: docs/ui-component-inventory.json
 * @public
 */

import { cva, type VariantProps } from "class-variance-authority";
import type { ReactElement } from "react";

const kpiBadgeToneVariants = {
  neutral: "bg-muted text-muted-foreground border-border",
  success: "bg-success text-[var(--color-white)] border-transparent",
  warning: "bg-warning text-[var(--color-white)] border-transparent",
  danger: "bg-danger text-[var(--color-white)] border-transparent",
} as const;

const kpiBadgeSizeVariants = {
  sm: "text-[var(--text-xs)] px-[var(--spacing-sm)] py-[var(--spacing-xs)]",
  md: "text-[var(--text-xs)] px-[var(--spacing-md)] py-[var(--spacing-xs)]",
} as const;

const kpiBadge = cva(
  "inline-flex items-center gap-[var(--spacing-xs)] rounded-full border font-medium transition-colors focus:outline-none focus:ring-[var(--ring-width-sm)] focus:ring-ring focus:ring-offset-[var(--ring-offset-w-sm)]",
  {
    variants: {
      tone: kpiBadgeToneVariants,
      size: kpiBadgeSizeVariants,
    },
    defaultVariants: {
      tone: "neutral",
      size: "sm",
    },
  }
);

const kpiBadgeRow = cva(
  "flex flex-wrap items-center justify-center gap-[var(--spacing-sm)]"
);

const kpiBadgeImage = cva("w-auto h-[var(--size-icon-lg)]");

const kpiBadgeLink = cva(
  "inline-block hover:opacity-[var(--opacity-80)] transition-opacity"
);

type KpiBadgeTone = VariantProps<typeof kpiBadge>["tone"];
type KpiBadgeSize = VariantProps<typeof kpiBadge>["size"];
type KpiBadgeKind = "text" | "external-image";

export interface KpiBadgeProps {
  /** Badge display mode */
  kind?: KpiBadgeKind;
  /** Visual tone for semantic meaning */
  tone?: KpiBadgeTone;
  /** Badge size */
  size?: KpiBadgeSize;

  /** Optional link URL */
  href?: string;
  /** Accessibility label */
  ariaLabel?: string;

  /** Text label for metric */
  label?: string;
  /** Metric value */
  value?: string;

  /** External badge image URL (e.g. SonarCloud, Shields.io) */
  imageSrc?: string;
  /** Alt text for external image */
  imageAlt?: string;
}

export function KpiBadge({
  kind = "text",
  tone = "neutral",
  size = "sm",
  href,
  ariaLabel,
  label,
  value,
  imageSrc,
  imageAlt,
}: KpiBadgeProps): ReactElement {
  const content =
    kind === "external-image" && imageSrc ? (
      // eslint-disable-next-line @next/next/no-img-element -- Feature-only badge uses static third-party SVG badges; Next Image import is blocked for feature layers.
      <img
        src={imageSrc}
        alt={imageAlt ?? ariaLabel ?? label ?? ""}
        width={100}
        height={24}
        className={kpiBadgeImage()}
        loading="lazy"
      />
    ) : (
      <span className={kpiBadge({ tone, size })}>
        {label}
        {value ? `: ${value}` : ""}
      </span>
    );

  if (!href) {
    return content;
  }

  return (
    <a
      href={href}
      aria-label={ariaLabel ?? label}
      target="_blank"
      rel="noopener noreferrer"
      className={kpiBadgeLink()}
    >
      {content}
    </a>
  );
}

interface KpiBadgeRowProps {
  badges: KpiBadgeProps[];
}

export function KpiBadgeRow({ badges }: KpiBadgeRowProps): ReactElement | null {
  if (!badges.length) return null;

  return (
    <div className={kpiBadgeRow()}>
      {badges.map((badge, idx) => (
        <KpiBadge key={`${badge.label ?? badge.imageSrc ?? idx}`} {...badge} />
      ))}
    </div>
  );
}
