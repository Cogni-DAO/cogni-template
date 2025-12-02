// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@components/kit/layout/Header`
 * Purpose: Mobile-first site header with responsive layout and overflow protection.
 * Scope: Provides site chrome with logo, nav, wallet, theme toggle, and mobile menu. Does not handle routing or analytics.
 * Invariants: No horizontal overflow; min-w-0/truncate/shrink-0 guards; GitHub hidden <lg; theme hidden <md.
 * Side-effects: none
 * Notes: Desktop wallet in [data-wallet-slot="desktop"] for CSS (see tailwind.css).
 *        Mobile: px-4 + logo pl-4; logo 24px, text-xl; MobileNav has GitHub + theme.
 * Links: src/components/kit/auth/WalletConnectButton.tsx, src/components/kit/navigation/MobileNav.tsx, src/styles/tailwind.css
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
import { WalletConnectButton } from "@/components/kit/auth/WalletConnectButton";

export function Header(): ReactElement {
  return (
    <header className="border-border border-b bg-background py-3">
      {/* Container: matches max-w-7xl pattern from Credits page */}
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          {/* Logo - min-w-0 prevents flex overflow */}
          <Link
            href="/"
            className="flex min-w-0 items-center gap-2 pl-4 sm:pl-0"
          >
            <Image
              src="/TransparentBrainOnly.png"
              alt="Cogni Brain Logo"
              width={24}
              height={24}
              className="shrink-0"
            />
            <span className="truncate font-bold text-gradient-accent text-xl">
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
            <div className="flex shrink-0 items-center gap-1 sm:gap-3">
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

              {/* Wallet: CSS-gated instances (compact on mobile, default on desktop) */}
              <WalletConnectButton variant="compact" className="sm:hidden" />
              <div data-wallet-slot="desktop" className="hidden sm:flex">
                <WalletConnectButton variant="default" />
              </div>

              {/* Theme toggle: hidden on mobile (in Sheet footer), visible on desktop */}
              <ModeToggle className="hidden md:flex" />

              {/* Mobile menu trigger - 44px touch target */}
              <MobileNav className="md:hidden" />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
