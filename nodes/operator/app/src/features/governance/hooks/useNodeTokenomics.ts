// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/governance/hooks/useNodeTokenomics`
 * Purpose: React hooks for the Ownership page's tokenomics reads. `useNodeTokenomicsConfig` fetches THIS
 *   NODE'S own token / distributor / chain identity from repo-spec (via the public tokenomics route) —
 *   manifest-independent, so tokenomics render even with zero finalized epochs. `useNodeTokenomics` then
 *   reads the on-chain facts (governance token total supply, the distributor's current undistributed
 *   balance, and a connected viewer's FULL wallet balance) so the UI honestly separates TOTAL HOLDINGS
 *   from EARNED-VIA-ATTRIBUTION from CLAIMABLE-NOW.
 * Scope: Client-side. Config comes from `GET /api/v1/public/attribution/tokenomics` (react-query);
 *   on-chain reads use wagmi useReadContract against the ERC20 governance token + distributor address.
 *   Does NOT read the claim manifest or perform DB access / write transactions.
 * Invariants:
 *   - CONFIG_NOT_MANIFEST: token/distributor/chain source is repo-spec, never a claim leaf.
 *   - ALL_MATH_BIGINT: totalSupply, distributor balance, and viewer balance stay bigint; formatted only at display.
 *   - READ_ONLY: pure on-chain reads; never mutates chain or DB state.
 *   - CALMLY_DISABLED: reads are gated on token/distributor/viewer presence; undefined until read (never throws for "not ready").
 *   - PUBLIC_NO_SECRETS: all inputs are public on-chain addresses + the connected wallet.
 * Side-effects: IO (config fetch); blockchain read (totalSupply, balanceOf).
 * Links: nodes/operator/app/src/app/api/v1/public/attribution/tokenomics/route.ts, packages/cogni-contracts/src/cumulative-merkle-distributor/abi.ts
 * @public
 */

import { type UseQueryResult, useQuery } from "@tanstack/react-query";
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

/**
 * THIS NODE'S own tokenomics identity, from repo-spec — independent of any distribution
 * manifest. Present the moment the DAO is formed + a distributor deployed.
 */
export interface NodeTokenomicsConfigDto {
  /** Governance ERC20 token address; null until on-chain. */
  readonly tokenAddress: `0x${string}` | null;
  /** Cumulative Merkle distributor address; null until deployed. */
  readonly distributorAddress: `0x${string}` | null;
  /** EVM chain id. */
  readonly chainId: number;
  /** repo-spec `distributions.status === "active"` (node has activated distributions). */
  readonly distributionsActive: boolean;
  /** Count of finalized attribution epochs. */
  readonly epochsCompleted: number;
}

async function fetchTokenomicsConfig(): Promise<NodeTokenomicsConfigDto> {
  const res = await fetch("/api/v1/public/attribution/tokenomics", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return res.json() as Promise<NodeTokenomicsConfigDto>;
}

/**
 * Fetch the node's token / distributor / chain / epoch-count from its OWN repo-spec.
 * MANIFEST-INDEPENDENT — resolves even on a freshly seeded node with zero finalized epochs.
 */
export function useNodeTokenomicsConfig(): UseQueryResult<
  NodeTokenomicsConfigDto,
  Error
> {
  return useQuery({
    queryKey: ["governance", "tokenomics-config"],
    queryFn: fetchTokenomicsConfig,
    staleTime: 60_000,
  });
}

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
    // Only an ENABLED-but-pending read counts as loading; a DISABLED read (null
    // distributor/viewer) reports pending in wagmi and must not wedge the UI on "…".
    isLoading:
      (hasToken && isSupplyLoading) ||
      (hasToken && Boolean(distributor) && isDistLoading) ||
      (hasToken && Boolean(viewer) && isViewerLoading),
    error: (supplyError ?? distError ?? viewerError ?? null) as Error | null,
    refetch: () => {
      void refetchSupply();
      void refetchDist();
      void refetchViewer();
    },
  };
}
