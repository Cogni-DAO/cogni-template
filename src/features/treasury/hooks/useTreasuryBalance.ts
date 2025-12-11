// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/treasury/hooks/useTreasuryBalance`
 * Purpose: React Query hook for treasury balance with no client-side polling.
 * Scope: Client-side only. Calls /api/v1/treasury/snapshot once per page load with long staleTime. Does not call RPC directly.
 * Invariants: NO refetchInterval, NO refetchOnWindowFocus; rely on staleTime only.
 * Side-effects: IO (HTTP GET to treasury snapshot API)
 * Notes: Phase 2: ETH balance only. Returns staleWarning if RPC unavailable.
 * Links: docs/ONCHAIN_READERS.md
 * @public
 */

"use client";

import { useQuery } from "@tanstack/react-query";

import type { TreasurySnapshotResponseV1 } from "@/contracts/treasury.snapshot.v1.contract";

const TREASURY_STALE_TIME_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Fetches treasury snapshot from API.
 * No authentication required (public data).
 */
async function fetchTreasurySnapshot(): Promise<TreasurySnapshotResponseV1> {
  const res = await fetch("/api/v1/treasury/snapshot");

  if (!res.ok) {
    throw new Error(`Treasury snapshot fetch failed: ${res.status}`);
  }

  return res.json();
}

export interface UseTreasuryBalanceResult {
  /** ETH balance formatted as decimal string (e.g., "3.726") */
  ethBalance: string | null;
  /** Whether data is currently loading */
  isLoading: boolean;
  /** Error if fetch failed */
  error: Error | null;
  /** Warning flag indicating stale/unavailable RPC data */
  staleWarning: boolean;
}

/**
 * Hook for treasury balance display.
 * Calls API once per page load; no client-side polling.
 *
 * @returns Treasury balance state with loading/error/staleWarning flags
 */
export function useTreasuryBalance(): UseTreasuryBalanceResult {
  const { data, isLoading, error } = useQuery({
    queryKey: ["treasury", "snapshot"],
    queryFn: fetchTreasurySnapshot,
    staleTime: TREASURY_STALE_TIME_MS, // Data stays fresh for 2 minutes
    refetchInterval: false, // NO polling
    refetchOnWindowFocus: false, // NO refetch on window focus
    retry: 1, // Retry once on failure
  });

  // Extract ETH balance from first balance entry
  const ethBalance =
    data?.balances && data.balances.length > 0
      ? (data.balances[0]?.balanceFormatted ?? null)
      : null;

  return {
    ethBalance,
    isLoading,
    error: error as Error | null,
    staleWarning: data?.staleWarning ?? false,
  };
}
