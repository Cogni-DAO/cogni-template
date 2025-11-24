// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@components/kit/layout/Header`
 * Purpose: Site header with navigation and authentication.
 * Scope: Provides site chrome. Does not handle routing, authentication logic, or analytics.
 * Invariants: Renders navigation, branding, and wallet button; forwards no props.
 * Side-effects: none
 * Notes: Uses CVA factories - no literal classes allowed.
 * Links: src/components/kit/auth/WalletConnectButton.tsx
 * @public
 */

"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { MouseEvent, ReactElement } from "react";

import {
  Container,
  GithubButton,
  ModeToggle,
  NavigationLink,
  WalletConnectButton,
} from "@/components";
import { brandText, header, row } from "@/styles/ui";

export function Header(): ReactElement {
  const { data: session } = useSession();
  const { openConnectModal } = useConnectModal();
  const router = useRouter();

  const handleChatClick = (e: MouseEvent): void => {
    e.preventDefault();
    if (session) {
      router.push("/chat");
    } else {
      openConnectModal?.();
    }
  };

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
              <NavigationLink href="/chat" onClick={handleChatClick}>
                Chat
              </NavigationLink>
            </nav>

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

            <WalletConnectButton />

            <ModeToggle />
          </div>
        </div>
      </Container>
    </header>
  );
}
