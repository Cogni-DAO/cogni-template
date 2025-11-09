// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@components/kit/navigation/SkipLink`
 * Purpose: Accessibility skip link for keyboard navigation to main content.
 * Scope: Provides visually hidden skip link that appears on focus. Does not handle routing logic.
 * Invariants: Uses CVA skipLink factory; hidden until focused; targets #main element.
 * Side-effects: none
 * Notes: Essential for keyboard navigation accessibility; follows WCAG skip link patterns.
 * Links: docs/UI_IMPLEMENTATION_GUIDE.md, WCAG 2.1 skip link requirements
 * @public
 */

import type { ReactElement, ReactNode } from "react";

import { skipLink } from "@/styles/ui";

interface SkipLinkProps {
  readonly target?: string;
  readonly children?: ReactNode;
}

export function SkipLink({
  target = "#main",
  children = "Skip to main content",
}: SkipLinkProps): ReactElement {
  return (
    <a href={target} className={skipLink()}>
      {children}
    </a>
  );
}
