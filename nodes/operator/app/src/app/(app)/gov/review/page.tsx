// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/(app)/gov/review/page`
 * Purpose: Server entrypoint for the viewable-to-all Finish Epoch workspace.
 * Scope: Passes node identity plus current-policy wallet context. Epoch-pinned and on-chain publish
 *   authority are resolved per action in the client; server routes remain authoritative.
 * Invariants: ACTIONS_GATED_NOT_STATE, REVIEW_AUTHORITY_IS_EPOCH_PINNED.
 * Side-effects: IO (auth session + config reads)
 * Links: src/app/api/v1/attribution/_lib/approver-guard.ts
 * @public
 */

import type { ReactElement } from "react";

import { getServerSessionUser } from "@/lib/auth/server";
import { getLedgerApprovers, getNodeId } from "@/shared/config";

import { ReviewView } from "./view";

export default async function ReviewPage(): Promise<ReactElement> {
  const user = await getServerSessionUser();
  const walletAddress = user?.walletAddress?.toLowerCase() ?? null;
  const isCurrentApprover =
    walletAddress !== null && getLedgerApprovers().includes(walletAddress);
  return (
    <ReviewView
      nodeId={getNodeId()}
      walletAddress={walletAddress}
      isCurrentApprover={isCurrentApprover}
    />
  );
}
