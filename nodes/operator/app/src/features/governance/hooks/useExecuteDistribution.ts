// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/governance/hooks/useExecuteDistribution`
 * Purpose: React hooks powering the two-state distribution PUBLISH surface.
 *   - `useExecuteDistribution` fetches the publish payload for a finalized epoch — the mint delta,
 *     new merkle root, distributor/token/DAO addresses, and chain — so a scoped publisher wallet can
 *     build the mint + setMerkleRoot actions. Read-only: the write is the caller's wagmi hook.
 *   - `useHasExecutePermission` uses paired probes to prove CAS-scoped DAO EXECUTE authority. Only
 *     the canonical atomic publish may pass; an otherwise-identical non-atomic payload must fail.
 * Scope: Client-side. The payload fetch hits the SIWE-authenticated per-node read route same-origin;
 *   the permission read is a pure on-chain view call. Neither performs DB access or write txs.
 * Invariants:
 *   - ALL_MATH_BIGINT: mintDelta arrives as a decimal string; callers BigInt() it before display/tx.
 *   - READ_ONLY_SERVES_R3: the payload is exactly what R3 persisted; the hook never mutates state.
 *   - CALMLY_NULL_ON_NOT_READY: 404 (epoch/node) and 409 (not finalized / no manifest / no
 *     distributor) resolve to a typed not-ready reason rather than throwing, so the panel can
 *     render a quiet "not ready yet" state.
 *   - PERMISSION_FAILS_CLOSED: only the exact paired-probe result unlocks publishing.
 * Side-effects: IO (HTTP GET to the authed distribution-tx route; on-chain hasPermission read).
 * Links: nodes/operator/app/src/app/api/v1/nodes/[id]/attribution/epochs/[eid]/distribution-tx/route.ts,
 *   nodes/operator/app/src/features/governance/lib/proposal-abis.ts
 * @public
 */

import { CUMULATIVE_MERKLE_DISTRIBUTOR_ABI } from "@cogni/cogni-contracts";
import { useQuery } from "@tanstack/react-query";
import { useReadContract } from "wagmi";

import {
  buildPublishPermissionProbe,
  type CasPublishPermissionState,
  classifyCasPublishPermission,
  DAO_ABI,
  EXECUTE_PERMISSION_ID,
} from "@/features/governance/lib/proposal-abis";

export interface ExecuteDistributionPayload {
  readonly epochId: string;
  readonly merkleRoot: `0x${string}`;
  /** Cumulative-delta to mint, in base units (decimal string). BigInt() before use. */
  readonly mintDelta: string;
  readonly distributorAddress: `0x${string}`;
  readonly tokenAddress: `0x${string}`;
  readonly daoAddress: `0x${string}`;
  readonly chainId: number;
  /** Direct publish is enabled only once an on-chain guard proves atomic replay protection. */
  readonly executionSafety: "legacy_shape_only" | "replay_safe";
  readonly alreadyExecutedRoot: `0x${string}` | null;
}

/** A distribution can't be executed yet (finalized-but-unrecorded, etc.). */
export type NotReadyReason =
  | "epoch_not_found"
  | "node_not_found"
  | "epoch_not_finalized"
  | "no_distribution_manifest"
  | "distributor_not_recorded"
  | "node_missing_governance"
  | "negative_mint_delta"
  | "superseded_manifest"
  | "already_published"
  | "publication_state_unknown";

interface ExecuteDistributionResult {
  readonly payload: ExecuteDistributionPayload | null;
  readonly notReady: NotReadyReason | null;
}

async function fetchExecutePayload(
  nodeId: string,
  epochId: string
): Promise<ExecuteDistributionResult> {
  const res = await fetch(
    `/api/v1/nodes/${encodeURIComponent(nodeId)}/attribution/epochs/${encodeURIComponent(
      epochId
    )}/distribution-tx`,
    {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    }
  );

  if (res.status === 404 || res.status === 409 || res.status === 503) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { payload: null, notReady: (body.error ?? null) as NotReadyReason };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }

  const payload = (await res.json()) as ExecuteDistributionPayload;
  return { payload, notReady: null };
}

export interface UseExecuteDistribution {
  readonly payload: ExecuteDistributionPayload | null;
  readonly notReady: NotReadyReason | null;
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly refetch: () => void;
}

/**
 * Resolve the execute payload for `nodeId`/`epochId`. `enabled` gates the fetch
 * (e.g. only run when the epoch is finalized and a distributor is recorded).
 */
export function useExecuteDistribution(
  nodeId: string | undefined,
  epochId: string | undefined,
  enabled = true
): UseExecuteDistribution {
  const active = enabled && Boolean(nodeId) && Boolean(epochId);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["governance", "execute-distribution", nodeId, epochId],
    queryFn: () => fetchExecutePayload(nodeId as string, epochId as string),
    enabled: active,
    staleTime: 30_000,
  });

  return {
    payload: data?.payload ?? null,
    notReady: data?.notReady ?? null,
    isLoading,
    error: error as Error | null,
    refetch: () => {
      void refetch();
    },
  };
}

export interface UseHasExecutePermission {
  /** True only when paired probes prove the current CAS-scoped condition. */
  readonly hasPermission: boolean | undefined;
  readonly permissionState: CasPublishPermissionState;
  readonly isLoading: boolean;
  readonly error: Error | null;
  /** Re-read after the authorize tx confirms so the UI advances to Publish. */
  readonly refetch: () => void;
}

/**
 * Read `DAO.hasPermission(_where=DAO, _who=wallet, EXECUTE_PERMISSION, <publish probe>)` on
 * chain. The grant is SCOPED via `DistributionPublishCondition`, so the probe `_data` must be
 * a representative compare-and-swap publish. A second, otherwise-identical probe sets a non-zero
 * allow-failure map and MUST be denied. Only the exact true/false pair unlocks publishing; a broad,
 * stale, unreadable, or missing grant fails closed.
 */
export function useHasExecutePermission(params: {
  daoAddress: `0x${string}` | undefined;
  wallet: `0x${string}` | undefined;
  tokenAddress: `0x${string}` | undefined | null;
  distributorAddress: `0x${string}` | undefined | null;
  chainId: number | undefined;
}): UseHasExecutePermission {
  const { daoAddress, wallet, tokenAddress, distributorAddress, chainId } =
    params;
  const enabled =
    Boolean(daoAddress) &&
    Boolean(wallet) &&
    Boolean(tokenAddress) &&
    Boolean(distributorAddress);

  const rootRead = useReadContract({
    abi: CUMULATIVE_MERKLE_DISTRIBUTOR_ABI,
    address: distributorAddress ?? undefined,
    functionName: "merkleRoot",
    chainId,
    query: { enabled },
  });
  const liveRoot =
    typeof rootRead.data === "string"
      ? (rootRead.data as `0x${string}`)
      : undefined;
  const probeReady = enabled && liveRoot !== undefined;
  const validProbeData =
    tokenAddress && distributorAddress && liveRoot
      ? buildPublishPermissionProbe(
          tokenAddress,
          distributorAddress,
          liveRoot,
          0n
        )
      : "0x";
  const nonAtomicProbeData =
    tokenAddress && distributorAddress && liveRoot
      ? buildPublishPermissionProbe(
          tokenAddress,
          distributorAddress,
          liveRoot,
          1n
        )
      : "0x";

  const validProbe = useReadContract({
    abi: DAO_ABI,
    address: daoAddress,
    functionName: "hasPermission",
    args: [
      daoAddress ?? "0x0000000000000000000000000000000000000000",
      wallet ?? "0x0000000000000000000000000000000000000000",
      EXECUTE_PERMISSION_ID,
      validProbeData,
    ],
    chainId,
    query: { enabled: probeReady },
  });
  const nonAtomicProbe = useReadContract({
    abi: DAO_ABI,
    address: daoAddress,
    functionName: "hasPermission",
    args: [
      daoAddress ?? "0x0000000000000000000000000000000000000000",
      wallet ?? "0x0000000000000000000000000000000000000000",
      EXECUTE_PERMISSION_ID,
      nonAtomicProbeData,
    ],
    chainId,
    query: { enabled: probeReady },
  });
  const permissionState = classifyCasPublishPermission(
    validProbe.data as boolean | undefined,
    nonAtomicProbe.data as boolean | undefined
  );

  return {
    hasPermission:
      permissionState === "loading"
        ? undefined
        : permissionState === "verified",
    permissionState,
    isLoading:
      rootRead.isLoading || validProbe.isLoading || nonAtomicProbe.isLoading,
    error: (rootRead.error ??
      validProbe.error ??
      nonAtomicProbe.error ??
      null) as Error | null,
    refetch: () => {
      void rootRead.refetch();
      void validProbe.refetch();
      void nonAtomicProbe.refetch();
    },
  };
}
