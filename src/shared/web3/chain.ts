// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/web3/chain`
 * Purpose: Single source of truth for blockchain network configuration across all web3 integrations.
 * Scope: Defines chain ID, DePay configuration, and token addresses; does not perform network calls. EVM-only (wagmi Chain). Solana would require a separate module.
 * Invariants: Ethereum Sepolia testnet for MVP; all blockchain interactions must use this configuration.
 * Side-effects: none
 * Notes: USDC address is the official USDC deployment on Ethereum Sepolia testnet.
 * Links: docs/PAYMENTS_DESIGN.md
 * @public
 */

import { sepolia } from "wagmi/chains";

/** Wagmi chain object for Ethereum Sepolia testnet. */
export const CHAIN = sepolia;

/** Ethereum Sepolia testnet chain ID (11155111). */
export const CHAIN_ID = CHAIN.id;

/**
 * The single chain ID used throughout the application.
 * Always Ethereum Sepolia for MVP; if we ever add another EVM chain, this module must be revisited.
 */
export function getChainId(): number {
  return CHAIN_ID;
}

/**
 * DePay blockchain identifier for the configured network.
 * "sepolia" is the documented identifier for Ethereum Sepolia testnet.
 */
export const DEPAY_BLOCKCHAIN = "sepolia";

/**
 * USDC token address on Ethereum Sepolia testnet.
 */
export const USDC_TOKEN_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";

/**
 * Minimum confirmations required for payment verification.
 * Transactions must have at least this many confirmations to be considered valid.
 */
export const MIN_CONFIRMATIONS = 2;

/**
 * Verification throttle in seconds (polling rate limit).
 * Minimum time between verification attempts to reduce RPC cost.
 */
export const VERIFY_THROTTLE_SECONDS = 10;
