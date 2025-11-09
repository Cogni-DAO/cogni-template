// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@components/kit/layout/Header`
 * Purpose: Site header component using existing kit components for navigation and theme switching.
 * Scope: Provides header layout with branding and controls. Does not handle routing logic or user authentication.
 * Invariants: Uses existing Container and CVA factories; blocks className prop; responsive design.
 * Side-effects: none
 * Notes: Composes existing Container, ModeToggle components; uses CVA styling only; based on saas-starter patterns.
 * Links: docs/UI_IMPLEMENTATION_GUIDE.md, Container.tsx, ModeToggle.tsx
 * @public
 */

import { CircleIcon } from "lucide-react";
import Link from "next/link";
import type { ReactElement } from "react";

import { Container, ModeToggle } from "@/components";
import { header, row } from "@/styles/ui";

export function Header(): ReactElement {
  return (
    <header className={header()}>
      <Container size="lg">
        <div className={row({ justify: "between", align: "center", gap: "md" })}>
          <Link href="/" className={row({ align: "center", gap: "sm" })}>
            <CircleIcon className="h-6 w-6 text-primary" />
            <span className="text-xl font-semibold text-foreground">
              Cogni
            </span>
          </Link>
          
          <div className={row({ align: "center", gap: "md" })}>
            <nav className={row({ align: "center", gap: "md" })}>
              <Link
                href="/pricing"
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Pricing
              </Link>
              <Link
                href="/docs"
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Docs
              </Link>
            </nav>
            
            <ModeToggle />
          </div>
        </div>
      </Container>
    </header>
  );
}