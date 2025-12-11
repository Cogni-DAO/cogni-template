// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/onchain/viem-treasury`
 * Purpose: Treasury balance adapter using direct RPC calls via EvmOnchainClient.
 * Scope: Implements TreasuryReadPort for ETH balances using viem. Does not handle business logic.
 * Invariants: Validates chainId and treasuryAddress from repo-spec; uses EvmOnchainClient for all RPC.
 * Side-effects: IO (RPC calls via EvmOnchainClient)
 * Notes: Phase 2: ETH only. Future: add ERC20 token support.
 * Links: docs/ONCHAIN_READERS.md
 * @public
 */

import { formatEther, getAddress } from "viem";

import type { TreasuryReadPort, TreasurySnapshot } from "@/ports";
import { getPaymentConfig } from "@/shared/config/repoSpec.server";
import type { EvmOnchainClient } from "@/shared/web3/onchain/evm-onchain-client.interface";

/**
 * Treasury adapter using EvmOnchainClient for direct RPC balance queries.
 * Phase 2: ETH balance only via getBalance().
 */
export class ViemTreasuryAdapter implements TreasuryReadPort {
  constructor(private readonly evmClient: EvmOnchainClient) {}

  async getTreasurySnapshot(params: {
    chainId: number;
    treasuryAddress: string;
    tokenAddresses?: string[];
  }): Promise<TreasurySnapshot> {
    // Validate params against canonical config
    const config = getPaymentConfig();

    if (params.chainId !== config.chainId) {
      throw new Error(
        `[ViemTreasuryAdapter] Chain ID mismatch: expected ${config.chainId}, got ${params.chainId}`
      );
    }

    const treasuryChecksummed = getAddress(params.treasuryAddress);
    const configTreasuryChecksummed = getAddress(config.receivingAddress);

    if (treasuryChecksummed !== configTreasuryChecksummed) {
      throw new Error(
        `[ViemTreasuryAdapter] Treasury address mismatch: expected ${config.receivingAddress}, got ${params.treasuryAddress}`
      );
    }

    // Phase 2: Only support ETH (native token)
    if (params.tokenAddresses && params.tokenAddresses.length > 0) {
      throw new Error(
        "[ViemTreasuryAdapter] ERC20 token support not yet implemented (Phase 2: ETH only)"
      );
    }

    // Query ETH balance
    const balanceWei = await this.evmClient.getBalance(
      treasuryChecksummed as `0x${string}`
    );
    const blockNumber = await this.evmClient.getBlockNumber();

    return {
      treasuryAddress: treasuryChecksummed,
      chainId: params.chainId,
      blockNumber,
      balances: [
        {
          token: "ETH",
          tokenAddress: null,
          balanceWei,
          balanceFormatted: formatEther(balanceWei),
          decimals: 18,
        },
      ],
      timestamp: Date.now(),
    };
  }
}
