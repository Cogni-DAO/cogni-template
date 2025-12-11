// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/api/v1/treasury/snapshot/route`
 * Purpose: HTTP endpoint for treasury balance snapshots.
 * Scope: Public endpoint (no auth). Delegates to facade with timeout; returns 200 even on RPC failure (with staleWarning). Does not perform RPC calls directly.
 * Invariants: Always returns 200; staleWarning indicates RPC timeout/error; validates output with contract.
 * Side-effects: IO (HTTP response, RPC via TreasuryReadPort through facade)
 * Notes: Phase 2: ETH balance only. No client-side polling - called once per page load.
 * Links: docs/ONCHAIN_READERS.md
 * @public
 */

import { NextResponse } from "next/server";

import { getTreasurySnapshotFacade } from "@/app/_facades/treasury/snapshot.server";
import { getSessionUser } from "@/app/_lib/auth/session";
import { wrapRouteHandlerWithLogging } from "@/bootstrap/http";
import { TreasurySnapshotResponseV1 } from "@/contracts/treasury.snapshot.v1.contract";

export const dynamic = "force-dynamic";

export const GET = wrapRouteHandlerWithLogging(
  {
    routeId: "treasury.snapshot",
    auth: { mode: "optional", getSessionUser }, // Public endpoint - auth optional
  },
  async (ctx) => {
    // Call facade - returns staleWarning on RPC failure instead of throwing
    const result = await getTreasurySnapshotFacade(ctx);

    // Validate output and return
    return NextResponse.json(TreasurySnapshotResponseV1.parse(result));
  }
);
