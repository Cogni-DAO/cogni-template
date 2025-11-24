// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/providers/wagmi-config-builder`
 * Purpose: Pure function to build wagmi configuration options with conditional connector logic.
 * Scope: Builds chains, transports, and connectors based on environment. Does not create wagmi config or import React.
 * Invariants: Base mainnet hardcoded; WalletConnect only when projectId present; injected always included.
 * Side-effects: none
 * Notes: Extracted for testability in node environment without jsdom. Used by WalletProvider after dynamic import.
 * Links: wagmi v2 configuration
 * @public
 */

import type { CreateConnectorFn, Transport } from "wagmi";
import { http } from "wagmi";

import { CHAIN } from "@/shared/web3";

export interface WalletEnv {
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?: string | undefined;
}

export interface ConnectorsLib<TConnector> {
  injected: () => TConnector;
  walletConnect: (opts: { projectId: string }) => TConnector;
}

interface BaseConfigOptions<TConnector> {
  chains: readonly [typeof CHAIN];
  transports: Record<number, Transport>;
  connectors: TConnector[];
}

// Wagmi-specific type aliases for production use
export type WagmiConnector = CreateConnectorFn;
export type WagmiConnectorsLib = ConnectorsLib<WagmiConnector>;
export type WagmiConfigOptions = BaseConfigOptions<WagmiConnector>;

export function buildWagmiConfigOptions<TConnector>(
  env: WalletEnv,
  connectorsLib: ConnectorsLib<TConnector>
): BaseConfigOptions<TConnector> {
  const chains = [CHAIN] as const;

  const transports = {
    [CHAIN.id]: http(),
  };

  // Always include injected wallet
  const connectors: TConnector[] = [connectorsLib.injected()];

  // Graceful degradation: add WalletConnect only when projectId present
  if (env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID) {
    connectors.push(
      connectorsLib.walletConnect({
        projectId: env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
      })
    );
  }

  return {
    chains,
    transports,
    connectors,
  };
}
