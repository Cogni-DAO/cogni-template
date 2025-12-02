// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@components/kit/navigation/MobileNav`
 * Purpose: Mobile navigation menu using Sheet component for hamburger menu.
 * Scope: Provides mobile-only navigation drawer with links and GitHub button. Does not handle routing logic.
 * Invariants: 44px touch target for trigger button; accessible via keyboard; focus trap inside Sheet.
 * Side-effects: none
 * Notes: Hidden at md+ breakpoint; GitHub button accessible here on mobile.
 * Links: src/components/vendor/shadcn/sheet.tsx
 * @public
 */

"use client";

import { Menu } from "lucide-react";
import type { ReactElement } from "react";

import { GithubButton, NavigationLink } from "@/components";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/vendor/shadcn/sheet";
import { cn } from "@/shared/util";
import { button } from "@/styles/ui";

interface MobileNavProps {
  readonly className?: string;
}

export function MobileNav({ className }: MobileNavProps): ReactElement {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          className={cn(
            button({ variant: "ghost", icon: true }),
            "h-11 w-11",
            className
          )}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </SheetTrigger>
      <SheetContent>
        <SheetTitle className="sr-only">Navigation menu</SheetTitle>
        <nav
          className="flex flex-col gap-4 py-4"
          aria-label="Mobile navigation"
        >
          <NavigationLink href="/chat">Chat</NavigationLink>
          <NavigationLink href="/credits">Credits</NavigationLink>
        </nav>
        {/* GitHub accessible here on mobile */}
        <GithubButton
          username="cogni-DAO"
          repo="cogni-template"
          size="lg"
          variant="default"
          showGithubIcon={true}
          showStarIcon={true}
          initialStars={0}
          targetStars={172900}
          autoAnimate={true}
          animationDuration={10}
        />
      </SheetContent>
    </Sheet>
  );
}
