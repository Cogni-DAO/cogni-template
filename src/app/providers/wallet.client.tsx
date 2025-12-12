// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/providers/wallet.client`
 * Purpose: Wallet provider for EVM wallet connections using wagmi and RainbowKit.
 * Scope: Wraps app with WagmiProvider and RainbowKitProvider with SSR support. Does not handle wallet UI or transaction signing.
 * Invariants: Static config with ssr: true and cookieStorage; always renders children (no null return);
 *        nested RainbowKitThemeProvider isolates theme changes from WagmiProvider.
 * Side-effects: none (providers only)
 * Notes: Static wagmi config prevents IndexedDB errors and unblocks non-wallet UI (e.g., public treasury badge).
 *        RainbowKitThemeProvider nested to prevent React Query Hydrate warnings on theme changes.
 * Links: https://rainbowkit.com/docs/installation, https://wagmi.sh/react/guides/ssr
 * @public
 */

"use client";

import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { RainbowKitSiweNextAuthProvider } from "@rainbow-me/rainbowkit-siwe-next-auth";
import { useTheme } from "next-themes";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { WagmiProvider } from "wagmi";

import { wagmiConfig } from "@/shared/web3/wagmi.config";

import { createAppDarkTheme, createAppLightTheme } from "./rainbowkit-theme";

/**
 * Nested component that handles RainbowKit theme switching.
 * Isolates theme changes from WagmiProvider to prevent Hydrate errors.
 */
function RainbowKitThemeProvider({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const theme = useMemo(
    () =>
      mounted && resolvedTheme === "light"
        ? createAppLightTheme()
        : createAppDarkTheme(),
    [mounted, resolvedTheme]
  );

  return <RainbowKitProvider theme={theme}>{children}</RainbowKitProvider>;
}

export function WalletProvider({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  return (
    <WagmiProvider config={wagmiConfig}>
      <RainbowKitSiweNextAuthProvider
        getSiweMessageOptions={() => ({
          statement: "Sign in with Ethereum to the app.",
        })}
      >
        <RainbowKitThemeProvider>{children}</RainbowKitThemeProvider>
      </RainbowKitSiweNextAuthProvider>
    </WagmiProvider>
  );
}
