// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@components/kit/layout/Header`
 * Purpose: Mobile-first site header with responsive navigation and overflow protection.
 * Scope: Provides site chrome with responsive breakpoints. Does not handle routing, authentication logic, or analytics.
 * Invariants: No horizontal overflow at any viewport; touch targets ≥ 44px; keyboard accessible.
 * Side-effects: none
 * Notes: Uses standard Tailwind classes for layout; GitHub only visible lg+ in header, accessible in MobileNav on mobile.
 * Links: src/components/kit/auth/WalletConnectButton.tsx, src/components/kit/navigation/MobileNav.tsx
 * @public
 */

"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactElement } from "react";

import {
  GithubButton,
  MobileNav,
  ModeToggle,
  NavigationLink,
} from "@/components";
import { SafeWalletConnectButton as WalletConnectButton } from "@/components/kit/auth/SafeWalletConnectButton";

export function Header(): ReactElement {
  return (
    <header className="border-border border-b bg-background py-3">
      {/* Container: matches max-w-7xl pattern from Credits page */}
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          {/* Logo - min-w-0 prevents flex overflow */}
          <Link href="/" className="flex min-w-0 items-center gap-2">
            <Image
              src="/TransparentBrainOnly.png"
              alt="Cogni Brain Logo"
              width={32}
              height={32}
              className="shrink-0"
            />
            <span className="truncate bg-gradient-to-r from-primary to-accent-blue bg-clip-text font-bold text-lg text-transparent">
              Cogni
            </span>
          </Link>

          {/* Nav + Action buttons grouped together on right */}
          <div className="flex shrink-0 items-center gap-4 sm:gap-6">
            {/* Desktop nav - hidden on mobile */}
            <nav
              className="hidden items-center gap-4 md:flex"
              aria-label="Primary"
            >
              <NavigationLink href="/chat">Chat</NavigationLink>
              <NavigationLink href="/credits">Credits</NavigationLink>
            </nav>

            {/* Action buttons - responsive */}
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              {/* GitHub: only visible lg+ in header (mobile users access via Sheet) */}
              <div className="hidden lg:flex">
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
              </div>

              {/* Wallet: compact on mobile, full on sm+ */}
              <WalletConnectButton variant="compact" className="sm:hidden" />
              <WalletConnectButton className="hidden sm:flex" />

              <ModeToggle />

              {/* Mobile menu trigger - 44px touch target */}
              <MobileNav className="md:hidden" />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
