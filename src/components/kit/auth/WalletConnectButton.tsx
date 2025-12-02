// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@components/kit/auth/WalletConnectButton`
 * Purpose: RainbowKit connect button with prop-driven variant and hydration stability.
 * Scope: Client-side only. Used in header. Does not handle wallet selection UI or persistence.
 * Invariants: Fixed dimensions per variant; skeleton overlay prevents CLS; no layout shift.
 * Side-effects: none
 * Notes: Shell/Inner split gates wagmi hooks. Desktop: 8.5rem + address. Mobile: avatar. TODO: cookie SSR.
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

/**
 * Inner component that uses wagmi hooks.
 * Only rendered after mount to prevent useAccount subscription during Hydrate render.
 */
function WalletConnectButtonInner({
  variant,
}: {
  variant: "default" | "compact";
}): React.JSX.Element {
  const { status } = useAccount();

  // Hide button during wagmi reconnect to prevent disconnected flash
  const isReconnecting = status === "connecting" || status === "reconnecting";

  // Mobile: right-align intrinsic button width
  // Desktop: fill shell entirely (via data-wallet-slot CSS selector)
  const buttonWrapperClass =
    variant === "compact"
      ? "flex h-full items-center justify-end" // Mobile: right-align
      : "flex h-full w-full items-center justify-center"; // Desktop: fill shell with centered content

  return (
    <div
      className={cn(
        "transition-opacity duration-200",
        buttonWrapperClass,
        isReconnecting ? "pointer-events-none opacity-0" : "opacity-100"
      )}
    >
      <ConnectButton
        label="Connect"
        accountStatus={variant === "compact" ? "avatar" : "address"}
        showBalance={false}
        chainStatus="none"
      />
    </div>
  );
}

/**
 * Shell component that renders fixed slot + skeleton.
 * No wagmi hooks to prevent setState during Hydrate render.
 */
export function WalletConnectButton({
  variant = "default",
  className,
}: WalletConnectButtonProps = {}): React.JSX.Element {
  const mounted = useIsMounted();

  // Fixed slot dimensions per variant (standardized on Connect-button size)
  const shellClass =
    variant === "compact"
      ? "h-11 w-[6.25rem] shrink-0" // Mobile: matches avatar button
      : "h-11 w-[8.5rem] shrink-0"; // Desktop: fixed shell for address display

  return (
    <div className={cn("relative", shellClass, className)}>
      {/* Skeleton overlay - visible until mounted, no wagmi hooks */}
      <div
        className={cn(
          "absolute inset-0 rounded-xl bg-muted transition-opacity duration-200",
          !mounted ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        aria-hidden="true"
      />

      {/* Inner with wagmi hooks - only render after mount to prevent Hydrate errors */}
      {mounted && <WalletConnectButtonInner variant={variant} />}
    </div>
  );
}
