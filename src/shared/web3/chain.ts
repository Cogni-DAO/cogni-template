// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/web3/chain`
 * Purpose: Single source of truth for blockchain network configuration across all web3 integrations.
 * Scope: Defines chain ID, DePay configuration, and token addresses; does not perform network calls. EVM-only (wagmi Chain). Solana would require a separate module.
 * Invariants: Base mainnet only; all blockchain interactions must use this configuration.
 * Side-effects: none
 * Notes: USDC address is the official USDC deployment on Base mainnet.
 * Links: docs/DEPAY_PAYMENTS.md
 * @public
 */

import { base } from "wagmi/chains";

/** Wagmi chain object for Base mainnet. */
export const CHAIN = base;

/** Base mainnet chain ID (8453). */
export const CHAIN_ID = CHAIN.id;

/**
 * The single chain ID used throughout the application.
 * Always Base; if we ever add another EVM chain, this module must be revisited.
 */
export function getChainId(): number {
  return CHAIN_ID;
}

/**
 * DePay blockchain identifier for the configured network.
 * "base" is the documented identifier for Base mainnet.
 */
export const DEPAY_BLOCKCHAIN = "base";

/**
 * USDC token address on Base mainnet.
 */
export const USDC_TOKEN_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
