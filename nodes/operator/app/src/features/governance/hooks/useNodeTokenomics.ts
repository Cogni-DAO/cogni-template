// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/governance/hooks/useNodeTokenomics`
 * Purpose: React hook reading a node's on-chain token facts for the Ownership page — the governance
 *   token total supply, the distributor's current (undistributed/in-flight) token balance, and a
 *   connected viewer's FULL wallet balance of the node token — so the UI can honestly separate
 *   TOTAL HOLDINGS from EARNED-VIA-ATTRIBUTION from CLAIMABLE-NOW.
 * Scope: Client-side on-chain reads (wagmi useReadContract) against the ERC20 governance token and the
 *   distributor address. Token/distributor/chain are sourced from the caller-supplied cumulative claim
 *   leaf (LatestDistributionClaimDto) — this hook does not fetch off-chain data or the claim itself.
 *   Does not perform DB access or write transactions.
 * Invariants:
 *   - ALL_MATH_BIGINT: totalSupply, distributor balance, and viewer balance stay bigint; formatted only at display.
 *   - READ_ONLY: pure on-chain reads; never mutates chain or DB state.
 *   - CALMLY_DISABLED: reads are gated on token/distributor/viewer presence; undefined until read (never throws for "not ready").
 *   - PUBLIC_NO_SECRETS: all inputs are public on-chain addresses + the connected wallet.
 * Side-effects: blockchain read (totalSupply, balanceOf).
 * Links: nodes/operator/app/src/features/governance/hooks/useCumulativeClaim.ts, packages/cogni-contracts/src/cumulative-merkle-distributor/abi.ts
 * @public
 */

import { useReadContract } from "wagmi";

/**
 * Minimal ERC20 read ABI (totalSupply + balanceOf). The node governance token is a
 * standard ERC20 (GovernanceERC20); we only read, never write, so this narrow ABI is
 * sufficient and avoids pulling a full token artifact into the client bundle.
 */
const ERC20_READ_ABI = [
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export interface NodeTokenomicsState {
  /** ERC20 totalSupply of the node governance token, in base units. undefined until read. */
  readonly totalSupply: bigint | undefined;
  /**
   * Distributor's current token balance in base units — undistributed / in-flight tokens
   * held by the CumulativeMerkleDrop awaiting claims. undefined until read.
   */
  readonly distributorBalance: bigint | undefined;
  /** Connected viewer's FULL wallet balance of the node token, in base units. undefined until read. */
  readonly viewerBalance: bigint | undefined;
  readonly isLoading: boolean;
  readonly error: Error | null;
  /** Re-read on-chain balances (e.g. after a claim tx confirms). */
  readonly refetch: () => void;
}

/**
 * Read the node's on-chain token facts. `token`, `distributor`, and `chainId` come from the
 * latest cumulative claim leaf; `viewer` is the connected wallet. Reads are individually gated,
 * so passing a null distributor (not yet recorded) or an unconnected viewer degrades gracefully.
 */
export function useNodeTokenomics(params: {
  token: `0x${string}` | null | undefined;
  distributor: `0x${string}` | null | undefined;
  viewer: `0x${string}` | null | undefined;
  chainId: number | undefined;
}): NodeTokenomicsState {
  const { token, distributor, viewer, chainId } = params;
  const hasToken = Boolean(token);

  const {
    data: totalSupply,
    isLoading: isSupplyLoading,
    error: supplyError,
    refetch: refetchSupply,
  } = useReadContract({
    abi: ERC20_READ_ABI,
    address: token ?? undefined,
    functionName: "totalSupply",
    chainId,
    query: { enabled: hasToken },
  });

  const {
    data: distributorBalance,
    isLoading: isDistLoading,
    error: distError,
    refetch: refetchDist,
  } = useReadContract({
    abi: ERC20_READ_ABI,
    address: token ?? undefined,
    functionName: "balanceOf",
    args: [distributor ?? "0x0000000000000000000000000000000000000000"],
    chainId,
    query: { enabled: hasToken && Boolean(distributor) },
  });

  const {
    data: viewerBalance,
    isLoading: isViewerLoading,
    error: viewerError,
    refetch: refetchViewer,
  } = useReadContract({
    abi: ERC20_READ_ABI,
    address: token ?? undefined,
    functionName: "balanceOf",
    args: [viewer ?? "0x0000000000000000000000000000000000000000"],
    chainId,
    query: { enabled: hasToken && Boolean(viewer) },
  });

  return {
    totalSupply: totalSupply as bigint | undefined,
    distributorBalance: distributorBalance as bigint | undefined,
    viewerBalance: viewerBalance as bigint | undefined,
    isLoading: isSupplyLoading || isDistLoading || isViewerLoading,
    error: (supplyError ?? distError ?? viewerError ?? null) as Error | null,
    refetch: () => {
      void refetchSupply();
      void refetchDist();
      void refetchViewer();
    },
  };
}
