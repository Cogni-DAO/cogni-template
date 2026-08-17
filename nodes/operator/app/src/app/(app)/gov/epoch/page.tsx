// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/(app)/gov/epoch/page`
 * Purpose: Server entrypoint for the current epoch governance page.
 * Scope: Server component only; resolves approver visibility and delegates client behavior to CurrentEpochView.
 * Invariants: Auth enforced by (app) layout guard. Server-side approver visibility is defense in depth;
 *   the review mutation route remains authoritative. Resolves the operator's own node id
 *   server-side (getNodeId) and passes it to the client view so the finalized-epoch
 *   ExecuteDistributionPanel can address the authed per-node distribution-tx route.
 * Side-effects: none (server render only; reads repo-spec node id)
 * Links: src/features/governance/types.ts, src/shared/config/repoSpec.server.ts
 * @public
 */

import type { ReactElement } from "react";

import { getServerSessionUser } from "@/lib/auth/server";
import { getLedgerApprovers } from "@/shared/config";
import { getNodeId } from "@/shared/config/repoSpec.server";
import { CurrentEpochView } from "./view";

export default async function CurrentEpochPage(): Promise<ReactElement> {
  const user = await getServerSessionUser();
  const approvers = getLedgerApprovers();
  const walletAddress = user?.walletAddress?.toLowerCase() ?? null;
  const isCurrentApprover =
    !!user?.walletAddress &&
    approvers.includes(user.walletAddress.toLowerCase());

  return (
    <CurrentEpochView
      nodeId={getNodeId()}
      walletAddress={walletAddress}
      isCurrentApprover={isCurrentApprover}
    />
  );
}
