// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/providers/wallet.client`
 * Purpose: Wallet provider for EVM wallet connections using wagmi and RainbowKit.
 * Scope: Wraps app with WagmiProvider and RainbowKitProvider. Does not handle server-side rendering of wallet context.
 * Invariants: Config created in useEffect (browser-only); stable across theme changes;
 *        nested RainbowKitThemeProvider isolates theme from WagmiProvider; triggers session refresh after SIWE.
 * Side-effects: IO (session update after SIWE verification)
 * Notes: Nested RainbowKitThemeProvider isolates theme changes from WagmiProvider to prevent React Query Hydrate warnings.
 *        Session refresh ensures immediate navigation after auth.
 * Links: https://rainbowkit.com/docs/authentication
 * @public
 */

"use client";

import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { RainbowKitSiweNextAuthProvider } from "@rainbow-me/rainbowkit-siwe-next-auth";
import { useTheme } from "next-themes";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type { Config } from "wagmi";
import { WagmiProvider } from "wagmi";

import { clientEnv } from "@/shared/env";
import { CHAIN } from "@/shared/web3";

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
  const [wagmiConfig, setWagmiConfig] = useState<Config | null>(null);

  // Create wagmi config in browser only to prevent IndexedDB SSR errors
  // Config created once and never recreated (stable across theme changes)
  useEffect(() => {
    let cancelled = false;

    async function initWagmiConfig() {
      const { getDefaultConfig } = await import("@rainbow-me/rainbowkit");
      const env = clientEnv();

      const config = getDefaultConfig({
        appName: "Cogni Template",
        projectId:
          env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "YOUR_PROJECT_ID",
        chains: [CHAIN],
        ssr: false,
      });

      if (!cancelled) {
        setWagmiConfig(config);
      }
    }

    initWagmiConfig();

    return () => {
      cancelled = true;
    };
  }, []);

  // Wait for config before rendering to prevent useAccount hook errors
  // Brief delay covered by skeleton overlay in WalletConnectButton
  if (!wagmiConfig) {
    return null;
  }

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
