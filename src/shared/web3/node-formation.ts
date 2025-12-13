// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/web3/node-formation`
 * Purpose: Node Formation (P0) chain constants.
 * Scope: Pure constants (no env).
 * Invariants: Must match deployed contracts on Sepolia.
 * Side-effects: none
 * @public
 */

export const ARAGON_OSX = {
  // TODO: Fill with real addresses (from docs/NODE_FORMATION_SPEC.md).
  daoFactory: "0x0000000000000000000000000000000000000000",
  pluginSetupProcessor: "0x0000000000000000000000000000000000000000",
  tokenVotingPluginRepo: "0x0000000000000000000000000000000000000000",
} as const;

export const TOKEN_VOTING_VERSION_TAG = {
  // TokenVoting v1.4.0 per spec
  release: 1,
  build: 4,
} as const;
