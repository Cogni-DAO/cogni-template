// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@components/kit/auth/WalletConnectButton`
 * Purpose: Renders the canonical RainbowKit connect button and enforces wallet-session consistency.
 * Scope: Client-side only. Used in the app header. Does not handle wallet selection UI.
 * Invariants: Must be wrapped in WagmiProvider and SessionProvider.
 * Side-effects: IO (Signs out user if wallet disconnects or changes via useWalletSessionConsistency)
 * Links: docs/AUTHENTICATION.md
 * @public
 */

"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import type React from "react";

import { useWalletSessionConsistency } from "./useWalletSessionConsistency";

export function WalletConnectButton(): React.JSX.Element {
  useWalletSessionConsistency();
  return <ConnectButton />;
}
