// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@components/kit/data-display/GithubButton`
 * Purpose: GitHub stars button wrapper component with typed props and CVA integration.
 * Scope: Provides GitHub stars button functionality without className prop. Uses vendor component internally.
 * Invariants: No className forwarding; uses typed props only; integrates with design system.
 * Side-effects: Makes GitHub API calls for live star counts
 * Notes: Wraps vendor GithubButton component to enforce architecture patterns.
 * Links: docs/UI_IMPLEMENTATION_GUIDE.md
 * @public
 */

import type { ReactElement } from "react";

import { GithubButton as VendorGithubButton } from "@/components/vendor/ui-primitives/shadcn/github-button";

export interface GithubButtonProps {
  /** Repository owner username */
  username: string;
  /** Repository name */
  repo: string;
  /** Whether to show abbreviated numbers (1.2k vs 1,234) */
  roundStars?: boolean;
  /** Button size variant */
  size?: "sm" | "default" | "lg";
  /** Button style variant */
  variant?: "default" | "outline";
  /** Whether to show GitHub icon */
  showGithubIcon?: boolean;
  /** Whether to show star icon */
  showStarIcon?: boolean;
  /** Button label text */
  label?: string | undefined;
  /** Animation duration in seconds */
  animationDuration?: number;
  /** Whether to auto-animate on mount */
  autoAnimate?: boolean;
  /** Override initial star count (instead of fetching from API) */
  initialStars?: number;
  /** Override target star count for animation */
  targetStars?: number;
}

export function GithubButton({
  username,
  repo,
  roundStars = true,
  size = "default",
  variant = "outline",
  showGithubIcon = true,
  showStarIcon = true,
  label,
  animationDuration = 2,
  autoAnimate = false,
  initialStars,
  targetStars,
}: GithubButtonProps): ReactElement {
  const repoUrl = `https://github.com/${username}/${repo}`;

  return (
    <VendorGithubButton
      repoUrl={repoUrl}
      variant={variant}
      size={size}
      roundStars={roundStars}
      showGithubIcon={showGithubIcon}
      showStarIcon={showStarIcon}
      {...(label && { label })}
      animationDuration={animationDuration}
      autoAnimate={autoAnimate}
      initialStars={initialStars ?? 0}
      targetStars={targetStars ?? 0}
    />
  );
}
