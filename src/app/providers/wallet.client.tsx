// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/providers/wallet.client`
 * Purpose: Wallet provider for EVM wallet connections using wagmi and RainbowKit.
 * Scope: Wraps app with WagmiProvider and RainbowKitProvider. Dynamically imports connectors client-side. Does not handle CSS imports.
 * Invariants: Config created in useEffect (client-only); connectors imported dynamically to avoid SSR IndexedDB errors.
 * Side-effects: IO (imports wagmi/connectors dynamically)
 * Notes: WalletConnect uses IndexedDB - must never be statically imported in SSR context. Dynamic import ensures browser-only.
 * Links: https://www.rainbowkit.com/docs/introduction
 * @public
 */

"use client";

import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { useTheme } from "next-themes";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { Config } from "wagmi";
import { createConfig, WagmiProvider } from "wagmi";

import { clientEnv } from "@/shared/env";

import { createAppDarkTheme, createAppLightTheme } from "./rainbowkit-theme";
import {
  buildWagmiConfigOptions,
  type WagmiConnector,
} from "./wagmi-config-builder";

export function WalletProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const { resolvedTheme } = useTheme();
  const [config, setConfig] = useState<Config | null>(null);

  useEffect(() => {
    async function initWagmiConfig(): Promise<void> {
      const env = clientEnv();

      // Dynamic import: only runs in browser, avoids SSR IndexedDB errors
      // WalletConnect library accesses IndexedDB at import time, so it must never be
      // statically imported in a module that Next.js evaluates during SSR/build
      const connectorsLib = await import("wagmi/connectors");

      // Build config options using pure helper (testable without React/jsdom)
      const { chains, transports, connectors } =
        buildWagmiConfigOptions<WagmiConnector>(
          {
            NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID:
              env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
          },
          {
            injected: () => connectorsLib.injected(),
            walletConnect: (opts) => connectorsLib.walletConnect(opts),
          }
        );

      // SSR disabled: config created client-side in useEffect
      const wagmiConfig = createConfig({
        chains,
        transports,
        connectors,
        ssr: false,
      });

      setConfig(wagmiConfig);
    }

    void initWagmiConfig();
  }, []);

  // Return null while config loads (first render only, fast)
  if (!config) {
    return null;
  }

  // Determine RainbowKit theme based on resolved theme
  // Default to light if resolvedTheme is undefined (initial render)
  const rainbowKitTheme =
    resolvedTheme === "dark" ? createAppDarkTheme() : createAppLightTheme();

  return (
    <WagmiProvider config={config}>
      <RainbowKitProvider theme={rainbowKitTheme}>
        {children}
      </RainbowKitProvider>
    </WagmiProvider>
  );
}
