// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/_facades/treasury/snapshot.server`
 * Purpose: App-layer facade for treasury snapshot reads with timeout handling.
 * Scope: Server-only. Resolves TreasuryReadPort from DI, calls with strict timeout, maps to contract DTO. Does not perform RPC calls directly or handle routing.
 * Invariants: Timeout enforced (3-5s); returns staleWarning on timeout/error instead of throwing.
 * Side-effects: IO (via TreasuryReadPort → EvmOnchainClient RPC)
 * Notes: No authentication required (public data). Returns 200 with staleWarning on RPC failure.
 * Links: docs/ONCHAIN_READERS.md
 * @public
 */

import { getContainer } from "@/bootstrap/container";
import type { TreasurySnapshotResponseV1 } from "@/contracts/treasury.snapshot.v1.contract";
import { getPaymentConfig } from "@/shared/config/repoSpec.server";
import type { RequestContext } from "@/shared/observability";

const TREASURY_RPC_TIMEOUT_MS = 5000; // 5 second strict timeout

/**
 * Wraps a promise with a timeout
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
}

/**
 * Gets treasury snapshot facade with timeout and graceful error handling.
 * Returns staleWarning: true on RPC timeout/error instead of throwing.
 *
 * @param ctx - Request context for logging
 * @returns Treasury snapshot or fallback with staleWarning
 */
export async function getTreasurySnapshotFacade(
  ctx: RequestContext
): Promise<TreasurySnapshotResponseV1> {
  const { treasuryReadPort } = getContainer();
  const config = getPaymentConfig();

  const start = performance.now();
  let rpcSuccess = false;

  try {
    // Call TreasuryReadPort with strict timeout
    const snapshot = await withTimeout(
      treasuryReadPort.getTreasurySnapshot({
        chainId: config.chainId,
        treasuryAddress: config.receivingAddress,
        tokenAddresses: [], // Phase 2: ETH only
      }),
      TREASURY_RPC_TIMEOUT_MS,
      "Treasury RPC timeout exceeded"
    );

    rpcSuccess = true;
    const duration = performance.now() - start;

    ctx.log.info(
      {
        chainId: config.chainId,
        treasuryAddress: config.receivingAddress,
        blockNumber: snapshot.blockNumber.toString(),
        balances: snapshot.balances.length,
        duration,
      },
      "treasury_rpc_success"
    );

    // Map TreasurySnapshot to contract DTO
    return {
      treasuryAddress: snapshot.treasuryAddress,
      chainId: snapshot.chainId,
      blockNumber: snapshot.blockNumber.toString(),
      balances: snapshot.balances.map((b) => ({
        token: b.token,
        tokenAddress: b.tokenAddress,
        balanceWei: b.balanceWei.toString(),
        balanceFormatted: b.balanceFormatted,
        decimals: b.decimals,
      })),
      timestamp: snapshot.timestamp,
      staleWarning: false,
    };
  } catch (error) {
    const duration = performance.now() - start;

    ctx.log.warn(
      {
        chainId: config.chainId,
        treasuryAddress: config.receivingAddress,
        duration,
        error: error instanceof Error ? error.message : String(error),
        rpcSuccess,
      },
      "treasury_rpc_failure"
    );

    // Return fallback response with staleWarning instead of throwing
    return {
      treasuryAddress: config.receivingAddress,
      chainId: config.chainId,
      blockNumber: "0",
      balances: [],
      timestamp: Date.now(),
      staleWarning: true,
    };
  }
}
