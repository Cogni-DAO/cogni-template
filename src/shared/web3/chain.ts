// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/web3/chain`
 * Purpose: Canonical blockchain network configuration for the deployment; defines chain constants validated against repo-spec.
 * Scope: Exports chain ID, token addresses, and payment constants; does not perform network calls. EVM-only (wagmi Chain). Solana would require separate constants.
 * Invariants: Single active chain per deployment; repo-spec chain_id must match CHAIN_ID or startup fails; all web3/wagmi code imports from here.
 * Side-effects: none
 * Links: docs/CHAIN_CONFIG.md, docs/PAYMENTS_DESIGN.md
 * @public
 */

import { sepolia } from "wagmi/chains";

/** Wagmi chain object for the active network. */
// TODO remove and replace with Base mainnet chain object
export const CHAIN = sepolia;

/** Chain ID for the active network. Validated against repo-spec at startup. */
export const CHAIN_ID = CHAIN.id;

/**
 * Returns the active chain ID.
 * Provided for consistency; direct import of CHAIN_ID is preferred.
 */
export function getChainId(): number {
  return CHAIN_ID;
}

/**
 * USDC token address on the active network.
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
