// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/web3/wagmi.config`
 * Purpose: Static wagmi configuration for wallet connections with SSR support.
 * Scope: Client-side only. Exports single wagmi config instance. Does not handle server-side RPC or chain reads.
 * Invariants: SSR enabled with cookieStorage; single active chain (CHAIN); WalletConnect projectId from env.
 * Side-effects: none (config creation only)
 * Notes: Uses RainbowKit's getDefaultConfig for opinionated defaults + SIWE integration.
 *        Config is static (created at module load) to prevent re-renders and IndexedDB errors.
 *        WalletConnect projectId optional (gracefully degrades to injected wallet only).
 * Links: https://rainbowkit.com/docs/installation, https://wagmi.sh/react/guides/ssr
 * @public
 */

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { cookieStorage, createStorage } from "wagmi";

import { clientEnv } from "@/shared/env";
import { CHAIN } from "./evm-wagmi";

/**
 * Static wagmi configuration for wallet connections.
 *
 * SSR-enabled with cookieStorage to prevent IndexedDB hydration errors.
 * WalletConnect projectId is optional - app degrades to injected wallet (MetaMask, etc.) if missing.
 */
export const wagmiConfig = getDefaultConfig({
  appName: "Cogni",
  projectId:
    clientEnv().NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "YOUR_PROJECT_ID",
  chains: [CHAIN],
  ssr: true,
  storage: createStorage({
    storage: cookieStorage,
  }),
});
