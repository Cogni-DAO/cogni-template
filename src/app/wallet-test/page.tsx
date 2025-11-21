// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/wallet-test/page`
 * Purpose: Throwaway dev-test page for verifying wallet connection functionality.
 * Scope: Renders RainbowKit ConnectButton and displays wallet connection status. Client component only. Does not persist state or make API calls.
 * Invariants: Only for development testing; displays connected address when wallet connected.
 * Side-effects: none
 * Notes: Inline implementation (no separate component file); uses useAccount hook to verify wagmi integration.
 * Links: https://www.rainbowkit.com/docs/connect-button
 * @public
 */

// TODO: DELETE after Step 4 complete - temporary test harness only

"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import type { ReactNode } from "react";
import { useAccount } from "wagmi";

export default function WalletTestPage(): ReactNode {
  const { address, isConnected } = useAccount();

  return (
    <div className="flex flex-col gap-[var(--spacing-md)] p-[var(--spacing-lg)]">
      <h1 className="text-[length:var(--font-size-xl)] font-[var(--font-weight-bold)]">
        Wallet Connection Test
      </h1>
      <ConnectButton />
      {isConnected && address && (
        <div className="text-muted-foreground">Connected: {address}</div>
      )}
    </div>
  );
}
