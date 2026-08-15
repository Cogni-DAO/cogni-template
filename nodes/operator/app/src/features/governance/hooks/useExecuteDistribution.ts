// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/governance/hooks/useExecuteDistribution`
 * Purpose: React hook fetching the EXECUTE payload for a finalized epoch — the mint delta, new
 *   merkle root, distributor/token/DAO/plugin addresses, and chain — so the owner's wallet can
 *   build ONE Aragon TokenVoting proposal (mint delta + setMerkleRoot) that EarlyExecution runs
 *   atomically. Read-only: the write is the caller's wagmi useWriteContract.
 * Scope: Client-side data fetch for the ExecuteDistributionPanel on the finalized-epoch gov view.
 *   Hits the AUTHED per-node route (owner session OR node.flight) — not a public route — so it must
 *   run same-origin with the owner's session cookie. Does not perform DB access or write txs.
 * Invariants:
 *   - ALL_MATH_BIGINT: mintDelta arrives as a decimal string; callers BigInt() it before display/tx.
 *   - READ_ONLY_SERVES_R3: the payload is exactly what R3 persisted; the hook never mutates state.
 *   - CALMLY_NULL_ON_NOT_READY: 404 (epoch/node) and 409 (not finalized / no manifest / no
 *     distributor) resolve to a typed not-ready reason rather than throwing, so the panel can
 *     render a quiet "not ready yet" state.
 * Side-effects: IO (HTTP GET to the authed distribution-tx route).
 * Links: nodes/operator/app/src/app/api/v1/nodes/[id]/attribution/epochs/[eid]/distribution-tx/route.ts
 * @public
 */

import { useQuery } from "@tanstack/react-query";

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
