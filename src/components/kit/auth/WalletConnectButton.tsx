// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@components/kit/auth/WalletConnectButton`
 * Purpose: RainbowKit connect button with prop-driven variant and hydration stability.
 * Scope: Client-side only. Used in header. Does not handle wallet selection UI or persistence.
 * Invariants: Fixed dimensions per variant; skeleton overlay prevents CLS; no layout shift.
 * Side-effects: none
 * Notes: Desktop: 8.5rem shell + address, CSS fill via [data-wallet-slot]. Mobile: avatar. Wagmi ssr:false. TODO: cookie SSR.
 * Links: docs/AUTHENTICATION.md, docs/HANDOFF_WALLET_BUTTON_STABILITY.md
 * @public
 */

"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import type React from "react";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

import { cn } from "@/shared/util";

interface WalletConnectButtonProps {
  /**
   * Visual variant: 'compact' for mobile, 'default' for desktop.
   * Determines fixed slot dimensions and label text.
   */
  readonly variant?: "default" | "compact";
  /**
   * Optional className for layout adjustments
   */
  readonly className?: string;
}

/**
 * Hook that returns false until first client effect runs.
 * Used to prevent hydration mismatch by deferring client-only content.
 */
function useIsMounted(): boolean {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted;
}

export function WalletConnectButton({
  variant = "default",
  className,
}: WalletConnectButtonProps = {}): React.JSX.Element {
  const isMounted = useIsMounted();
  const { status } = useAccount();

  // Gate on both React mount AND wagmi reconnect to prevent intermediate disconnected flash
  const isWalletHydrating =
    !isMounted || status === "connecting" || status === "reconnecting";

  // Fixed slot dimensions per variant (standardized on Connect-button size)
  const shellClass =
    variant === "compact"
      ? "h-11 w-[6.25rem] shrink-0" // Mobile: matches avatar button
      : "h-11 w-[8.5rem] shrink-0"; // Desktop: fixed shell for address display

  // Mobile: right-align intrinsic button width
  // Desktop: fill shell entirely (via data-wallet-slot CSS selector)
  const buttonWrapperClass =
    variant === "compact"
      ? "flex h-full items-center justify-end" // Mobile: right-align
      : "flex h-full w-full items-center justify-center"; // Desktop: fill shell with centered content

  return (
    <div className={cn("relative", shellClass, className)}>
      {/* Skeleton overlay - matches fixed slot dimensions exactly */}
      <div
        className={cn(
          "absolute inset-0 rounded-xl bg-muted transition-opacity duration-200",
          isWalletHydrating ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        aria-hidden="true"
      />

      {/* ConnectButton - mobile right-aligns, desktop fills */}
      <div
        className={cn(
          "transition-opacity duration-200",
          buttonWrapperClass,
          isWalletHydrating ? "pointer-events-none opacity-0" : "opacity-100"
        )}
      >
        <ConnectButton
          label="Connect"
          accountStatus={variant === "compact" ? "avatar" : "address"}
          showBalance={false}
          chainStatus="none"
        />
      </div>
    </div>
  );
}
