// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@components/kit/auth/SafeWalletConnectButton`
 * Purpose: SSR-safe wrapper for WalletConnectButton with variant support.
 * Scope: Client-side only. Handles dynamic loading and placeholder. Does not render wallet logic on server.
 * Invariants: Renders placeholder on server/loading; renders button on client; forwards variant prop.
 * Side-effects: none
 * Links: src/components/kit/auth/WalletConnectButton.tsx
 * @public
 */

"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

import type { WalletConnectButton } from "./WalletConnectButton";

type WalletConnectButtonProps = ComponentProps<typeof WalletConnectButton>;

const DynamicWalletConnectButton = dynamic(
  () => import("./WalletConnectButton").then((mod) => mod.WalletConnectButton),
  {
    ssr: false,
    loading: () => null, // No placeholder to prevent duplicate flash
  }
);

export function SafeWalletConnectButton(
  props: WalletConnectButtonProps
): React.JSX.Element {
  return <DynamicWalletConnectButton {...props} />;
}
