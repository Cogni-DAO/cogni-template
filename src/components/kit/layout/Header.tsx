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

import Image from "next/image";
import Link from "next/link";
import type { ReactElement } from "react";

import { Container, ModeToggle, NavigationLink } from "@/components";
import { brandText, header, row } from "@/styles/ui";

export function Header(): ReactElement {
  return (
    <header role="banner" className={header()}>
      <Container size="lg">
        <div
          className={row({ justify: "between", align: "center", gap: "md" })}
        >
          <Link href="/" className={row({ align: "center", gap: "sm" })}>
            <Image
              src="/TransparentBrainOnly.png"
              alt="Cogni Brain Logo"
              width={32}
              height={32}
            />
            <span className={brandText({ size: "lg", tone: "gradient" })}>
              Cogni
            </span>
          </Link>

          <div className={row({ align: "center", gap: "md" })}>
            <nav
              aria-label="Primary"
              className={row({ align: "center", gap: "md" })}
            >
              <NavigationLink href="/docs">Docs</NavigationLink>
            </nav>

            <ModeToggle />
          </div>
        </div>
      </Container>
    </header>
  );
}
