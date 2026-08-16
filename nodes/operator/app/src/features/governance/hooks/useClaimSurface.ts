// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/governance/hooks/useClaimSurface`
 * Purpose: React hook composing the GROUND-TRUTH inputs of the Ownership claim surface — repo-spec
 *   tokenomics config (activation status + distributor), the viewer's latest-manifest leaf, and the
 *   live on-chain `merkleRoot()` / `cumulativeClaimed` — into ONE first-class ClaimSurfaceState.
 * Scope: Client-side composition for CumulativeClaimPanel. Sources: useNodeTokenomicsConfig
 *   (public tokenomics route), useCumulativeClaim (latest-distribution route + chain), and a wagmi
 *   `merkleRoot()` read. State derivation itself is pure (claim-surface-state.ts). No DB access,
 *   no write transactions.
 * Invariants:
 *   - HONEST_EMPTY / LEAF_BEATS_STALE_SPEC / ROOT_GATED_CTA: enforced by deriveClaimSurfaceState.
 *   - CONFIG_NOT_MANIFEST: the fallback distributor/chain come from repo-spec, so pre-leaf states
 *     (not-activated, not-published) resolve even with NO claim leaf and NO wallet.
 *   - ALL_MATH_BIGINT: amounts stay bigint; formatted only at display.
 * Side-effects: IO (config + claim fetch); blockchain read (merkleRoot, cumulativeClaimed).
 * Links: nodes/operator/app/src/features/governance/lib/claim-surface-state.ts, nodes/operator/app/src/features/governance/hooks/useCumulativeClaim.ts
 * @public
 */

import { CUMULATIVE_MERKLE_DISTRIBUTOR_ABI } from "@cogni/cogni-contracts";
import { useMemo } from "react";
import { useReadContract } from "wagmi";

import { useCumulativeClaim } from "@/features/governance/hooks/useCumulativeClaim";
import { useNodeTokenomicsConfig } from "@/features/governance/hooks/useNodeTokenomics";
import {
  type ClaimSurfaceState,
  deriveClaimSurfaceState,
} from "@/features/governance/lib/claim-surface-state";

export interface ClaimSurface {
  /** The single honest state to render (discriminated union). */
  readonly state: ClaimSurfaceState;
  /** Chain the distributor/token live on (leaf first, repo-spec fallback). */
  readonly chainId: number | undefined;
  /** Distributor address (leaf first, repo-spec fallback); null until recorded. */
  readonly distributor: `0x${string}` | null;
  /** Re-read cumulativeClaimed (call after a claim tx confirms). */
  readonly refetchClaimed: () => void;
}

/**
 * Resolve the Ownership claim surface for `account` (undefined = wallet not connected).
 * Pre-leaf states (not-activated / not-published) resolve without a wallet.
 */
export function useClaimSurface(account: string | undefined): ClaimSurface {
  const walletConnected = Boolean(account);

  const { data: config, isLoading: configLoading } = useNodeTokenomicsConfig();

  const {
    claim,
    cumulativeClaimed,
    isLoading: claimLoading,
    isClaimedLoading,
    error: claimError,
    refetchClaimed,
  } = useCumulativeClaim(account);

  // Leaf first, repo-spec fallback — so the on-chain root resolves even when the
  // viewer has no leaf (or no wallet) and the honest pre-claim states still render.
  const distributor = (claim?.distributor ??
    config?.distributorAddress ??
    null) as `0x${string}` | null;
  const chainId = claim?.chainId ?? config?.chainId;

  const rootReadEnabled = Boolean(distributor) && chainId !== undefined;
  const {
    data: onChainRootRaw,
    isLoading: isRootLoading,
    error: rootError,
  } = useReadContract({
    abi: CUMULATIVE_MERKLE_DISTRIBUTOR_ABI,
    address: distributor ?? undefined,
    functionName: "merkleRoot",
    chainId,
    query: { enabled: rootReadEnabled },
  });

  // undefined = still reading, null = read failed (chain unavailable), string = root.
  // A DISABLED read reports pending in wagmi — only an ENABLED read may count as loading.
  const onChainRoot: string | null | undefined = rootError
    ? null
    : (onChainRootRaw as string | undefined);
  const rootLoading = rootReadEnabled && isRootLoading;

  const state = useMemo(
    () =>
      deriveClaimSurfaceState({
        walletConnected,
        configLoading,
        distributionsActive: config?.distributionsActive,
        configDistributor: config?.distributorAddress ?? null,
        claim,
        claimLoading,
        claimError,
        onChainRoot: rootLoading ? undefined : onChainRoot,
        cumulativeClaimed,
        claimedLoading: isClaimedLoading,
      }),
    [
      walletConnected,
      configLoading,
      config?.distributionsActive,
      config?.distributorAddress,
      claim,
      claimLoading,
      claimError,
      rootLoading,
      onChainRoot,
      cumulativeClaimed,
      isClaimedLoading,
    ]
  );

  return { state, chainId, distributor, refetchClaimed };
}
