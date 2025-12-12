// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/web3/block-explorer`
 * Purpose: Block explorer URL utilities for viewing addresses and transactions on chain explorers.
 * Scope: Pure utility functions. Does not make network calls or access config directly.
 * Invariants: Returns null for unknown chains; reads explorer URLs from chain.ts CHAINS map.
 * Side-effects: none
 * Notes: All chain-specific config centralized in chain.ts; no parallel maps here.
 * Links: src/shared/web3/chain.ts, docs/PAYMENTS_DESIGN.md
 * @public
 */

import { CHAINS } from "./chain";

/**
 * Maps chain ID to block explorer base URL.
 * Returns null for unsupported chains.
 */
function getBlockExplorerBase(chainId: number): string | null {
  // Find chain config by chainId
  const chainConfig = Object.values(CHAINS).find((c) => c.chainId === chainId);
  return chainConfig?.explorerBaseUrl ?? null;
}

/**
 * Generates block explorer URL for a given address on the specified chain.
 *
 * @param chainId - Chain ID (from chain.ts CHAINS map)
 * @param address - Ethereum address to view
 * @returns Block explorer URL or null if chain not supported
 */
export function getAddressExplorerUrl(
  chainId: number,
  address: string
): string | null {
  const base = getBlockExplorerBase(chainId);
  if (!base) return null;
  return `${base}/address/${address}`;
}

/**
 * Generates block explorer URL for a given transaction on the specified chain.
 *
 * @param chainId - Chain ID (from chain.ts CHAINS map)
 * @param txHash - Transaction hash to view
 * @returns Block explorer URL or null if chain not supported
 */
export function getTransactionExplorerUrl(
  chainId: number,
  txHash: string
): string | null {
  const base = getBlockExplorerBase(chainId);
  if (!base) return null;
  return `${base}/tx/${txHash}`;
}
