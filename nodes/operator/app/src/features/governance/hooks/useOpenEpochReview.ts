// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/governance/hooks/useOpenEpochReview`
 * Purpose: Client mutation for moving an ended epoch from open to review.
 * Scope: Calls the approver-gated review route and refreshes governance queries. Does not decide authorization.
 * Invariants: Server remains the authorization and epoch-state authority; double submission is prevented in the UI.
 * Side-effects: IO (HTTP POST, React Query invalidation)
 * Links: src/app/api/v1/attribution/epochs/[id]/review/route.ts, work item bug.5042
 * @public
 */

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

interface ReviewEpochResponse {
  readonly epoch: {
    readonly id: string;
    readonly status: "review";
  };
}

async function openEpochReview(epochId: string): Promise<ReviewEpochResponse> {
  const response = await fetch(
    `/api/v1/attribution/epochs/${encodeURIComponent(epochId)}/review`,
    {
      method: "POST",
      credentials: "same-origin",
    }
  );

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      readonly error?: string;
    } | null;
    throw new Error(
      body?.error ?? `Unable to open review (HTTP ${response.status})`
    );
  }

  return (await response.json()) as ReviewEpochResponse;
}

export function isEpochReadyForReview(
  status: "open" | "review" | "finalized",
  periodEnd: string,
  nowMs: number
): boolean {
  const periodEndMs = Date.parse(periodEnd);
  return (
    status === "open" && Number.isFinite(periodEndMs) && nowMs >= periodEndMs
  );
}

/** Hydration-safe clock edge: false during SSR/hydration, then flips at periodEnd. */
export function useEpochReviewReadiness(
  status: "open" | "review" | "finalized",
  periodEnd: string
): boolean {
  const [boundaryReached, setBoundaryReached] = useState(false);

  useEffect(() => {
    if (status !== "open") return;
    const periodEndMs = Date.parse(periodEnd);
    if (!Number.isFinite(periodEndMs)) return;

    const remainingMs = Math.max(0, periodEndMs - Date.now());
    const timer = window.setTimeout(
      () => setBoundaryReached(true),
      remainingMs
    );
    return () => window.clearTimeout(timer);
  }, [periodEnd, status]);

  return status === "open" && boundaryReached;
}

export function useOpenEpochReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: openEpochReview,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["governance"] });
    },
  });
}
