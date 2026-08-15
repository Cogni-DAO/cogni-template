// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/governance/hooks/useExecuteDistribution`
 * Purpose: React hooks powering the two-state distribution PUBLISH surface.
 *   - `useExecuteDistribution` fetches the publish payload for a finalized epoch — the mint delta,
 *     new merkle root, distributor/token/DAO/plugin addresses, and chain — so the owner's wallet can
 *     build the mint + setMerkleRoot actions. Read-only: the write is the caller's wagmi hook.
 *   - `useHasExecutePermission` reads `DAO.hasPermission(DAO, wallet, EXECUTE_PERMISSION, "0x")` on
 *     chain so the panel knows whether the wallet already holds standing publish authority. If NOT,
 *     the UI shows the ONE-TIME authorize step (a governance proposal granting EXECUTE_PERMISSION);
 *     if YES, it shows the PER-EPOCH direct `DAO.execute([mint,setRoot])` publish (no vote).
 * Scope: Client-side. The payload fetch hits the AUTHED per-node route (owner session OR node.flight)
 *   same-origin with the session cookie; the permission read is a pure on-chain view call. Neither
 *   performs DB access or write txs.
 * Invariants:
 *   - ALL_MATH_BIGINT: mintDelta arrives as a decimal string; callers BigInt() it before display/tx.
 *   - READ_ONLY_SERVES_R3: the payload is exactly what R3 persisted; the hook never mutates state.
 *   - CALMLY_NULL_ON_NOT_READY: 404 (epoch/node) and 409 (not finalized / no manifest / no
 *     distributor) resolve to a typed not-ready reason rather than throwing, so the panel can
 *     render a quiet "not ready yet" state.
 *   - PERMISSION_GATES_UI: hasPermission is `undefined` until read (never throws for "not ready"),
 *     so the panel can hold both steps behind a loading state and re-read after the authorize tx.
 * Side-effects: IO (HTTP GET to the authed distribution-tx route; on-chain hasPermission read).
 * Links: nodes/operator/app/src/app/api/v1/nodes/[id]/attribution/epochs/[eid]/distribution-tx/route.ts,
 *   nodes/operator/app/src/features/governance/lib/proposal-abis.ts
 * @public
 */

import { useQuery } from "@tanstack/react-query";
import { encodeFunctionData } from "viem";
import { useReadContract } from "wagmi";

import {
  DAO_ABI,
  EXECUTE_PERMISSION_ID,
} from "@/features/governance/lib/proposal-abis";

/** Minimal ABIs to build a REPRESENTATIVE publish payload for the permission probe. */
const MINT_ABI = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [{ type: "address" }, { type: "uint256" }],
    outputs: [],
  },
] as const;
const SET_MERKLE_ROOT_ABI = [
  {
    type: "function",
    name: "setMerkleRoot",
    stateMutability: "nonpayable",
    inputs: [{ type: "bytes32" }],
    outputs: [],
  },
] as const;
const ZERO_ROOT =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;
const PROBE_CALL_ID =
  "0x0000000000000000000000000000000000000000000000000000000000000001" as const;

/**
 * A SCOPED EXECUTE grant (via `DistributionPublishCondition`) only reads as `hasPermission`
 * when the probe `_data` is a well-formed publish call — `DAO.execute([mint(distributor,*),
 * setMerkleRoot(*)])`. Probing with empty `"0x"` makes the condition DENY (empty ≠ publish
 * shape), so a live grant would falsely read `false`. This builds a representative (amount 0,
 * root 0) publish payload so the condition returns true for an authorized wallet.
 */
function buildPublishProbeData(
  token: `0x${string}`,
  distributor: `0x${string}`
): `0x${string}` {
  const mintData = encodeFunctionData({
    abi: MINT_ABI,
    functionName: "mint",
    args: [distributor, 0n],
  });
  const rootData = encodeFunctionData({
    abi: SET_MERKLE_ROOT_ABI,
    functionName: "setMerkleRoot",
    args: [ZERO_ROOT],
  });
  return encodeFunctionData({
    abi: DAO_ABI,
    functionName: "execute",
    args: [
      PROBE_CALL_ID,
      [
        { to: token, value: 0n, data: mintData },
        { to: distributor, value: 0n, data: rootData },
      ],
      0n,
    ],
  });
}

export interface ExecuteDistributionPayload {
  readonly epochId: string;
  readonly merkleRoot: `0x${string}`;
  /** Cumulative-delta to mint, in base units (decimal string). BigInt() before use. */
  readonly mintDelta: string;
  readonly distributorAddress: `0x${string}`;
  readonly tokenAddress: `0x${string}`;
  readonly daoAddress: `0x${string}`;
  readonly pluginAddress: `0x${string}`;
  readonly chainId: number;
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
  | "negative_mint_delta";

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

  if (res.status === 404 || res.status === 409) {
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
  /** True once the wallet holds EXECUTE_PERMISSION on the DAO. `undefined` until read. */
  readonly hasPermission: boolean | undefined;
  readonly isLoading: boolean;
  readonly error: Error | null;
  /** Re-read after the authorize tx confirms so the UI advances to Publish. */
  readonly refetch: () => void;
}

/**
 * Read `DAO.hasPermission(_where=DAO, _who=wallet, EXECUTE_PERMISSION, <publish probe>)` on
 * chain. The grant is SCOPED via `DistributionPublishCondition`, so the probe `_data` must be
 * a representative publish call (`execute([mint(distributor,0), setMerkleRoot(0)])`) or the
 * condition denies it — see `buildPublishProbeData`. Gates the publish surface: false ⇒ show
 * the one-time authorize step, true ⇒ show the per-epoch direct execute. Disabled (undefined)
 * until DAO + wallet + token + distributor are all present.
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

  const probeData =
    tokenAddress && distributorAddress
      ? buildPublishProbeData(tokenAddress, distributorAddress)
      : "0x";

  const { data, isLoading, error, refetch } = useReadContract({
    abi: DAO_ABI,
    address: daoAddress,
    functionName: "hasPermission",
    // _where=DAO, _who=wallet, _permissionId=EXECUTE_PERMISSION, _data=<publish probe>
    args: [
      daoAddress ?? "0x0000000000000000000000000000000000000000",
      wallet ?? "0x0000000000000000000000000000000000000000",
      EXECUTE_PERMISSION_ID,
      probeData,
    ],
    chainId,
    query: { enabled },
  });

  return {
    hasPermission: data as boolean | undefined,
    isLoading,
    error: error as Error | null,
    refetch: () => {
      void refetch();
    },
  };
}
