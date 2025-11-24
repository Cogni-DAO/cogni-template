// src/shared/web3/chain.ts

import { clientEnv } from "@/shared/env";

/**
 * Module: `@shared/web3/chain`
 * Purpose: Single source of truth for blockchain network configuration across all web3 integrations
 * Scope: Defines chain ID, wagmi chain object, DePay configuration, and token addresses
 * Invariants: Base mainnet only for production; all blockchain interactions must use this configuration.
 * Side-effects: none
 * Notes: USDC address is the official USDC deployment on Base mainnet.
 * @public
 */

/** Base mainnet chain ID. */
export const BASE_CHAIN_ID = 8453 as const;

/**
 * The single chain ID used throughout the application.
 * Defaults to Base mainnet (8453).
 */
export function getChainId(): number {
  return clientEnv().NEXT_PUBLIC_CHAIN_ID ?? BASE_CHAIN_ID;
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
