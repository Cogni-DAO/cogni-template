// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@components/kit/auth/SafeWalletConnectButton`
 * Purpose: SSR-safe wrapper for WalletConnectButton.
 * Scope: Client-side only. Handles dynamic loading and placeholder. Does not render wallet logic on server.
 * Invariants: Renders placeholder on server/loading; renders button on client.
 * Side-effects: none
 * Links: src/components/kit/auth/WalletConnectButton.tsx
 * @public
 */

"use client";

import dynamic from "next/dynamic";

export const SafeWalletConnectButton = dynamic(
  () => import("./WalletConnectButton").then((mod) => mod.WalletConnectButton),
  {
    ssr: false,
    loading: () => (
      <div className="h-10 w-36 animate-pulse rounded-xl bg-muted" />
    ),
  }
);
