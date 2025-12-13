// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@setup-core/aragon`
 * Purpose: Aragon OSx address/config constants for Node Formation P0.
 * Scope: Pure constants only. No RPC, no env access.
 * Invariants: Addresses must match the active chain deployment.
 * Side-effects: none
 * @public
 */

export type HexAddress = `0x${string}`;

export type AragonOsxAddresses = {
  daoFactory: HexAddress;
  pluginSetupProcessor: HexAddress;
  tokenVotingPluginRepo: HexAddress;
};

/**
 * NOTE: These are placeholders until wired to `src/shared/web3/chain.ts`.
 * They must be kept in sync with the chain constants used by the app.
 */
export const ARAGON_OSX_SEPOLIA: AragonOsxAddresses = {
  daoFactory: "0x0000000000000000000000000000000000000000",
  pluginSetupProcessor: "0x0000000000000000000000000000000000000000",
  tokenVotingPluginRepo: "0x0000000000000000000000000000000000000000",
};

export const ARAGON_OSX_BASE: AragonOsxAddresses = {
  daoFactory: "0x0000000000000000000000000000000000000000",
  pluginSetupProcessor: "0x0000000000000000000000000000000000000000",
  tokenVotingPluginRepo: "0x0000000000000000000000000000000000000000",
};
