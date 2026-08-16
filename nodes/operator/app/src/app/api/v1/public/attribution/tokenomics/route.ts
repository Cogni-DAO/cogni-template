// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/api/v1/public/attribution/tokenomics/route`
 * Purpose: Public HTTP endpoint serving THIS NODE'S own tokenomics identity — the governance
 *   token, the cumulative Merkle distributor, chain id, and count of finalized epochs — sourced
 *   from the node's OWN repo-spec (governance.token_contract, distributions.distributor_address,
 *   governance.chain_id) + the attribution store. MANIFEST-INDEPENDENT: renders whenever the node
 *   has a token, whether or not any distribution has ever been executed.
 * Scope: Public route via wrapPublicRoute(). Reads repo-spec config + finalized-epoch count. Does
 *   NOT read on-chain balances (the client reads totalSupply/balanceOf via wagmi) or claim manifests.
 * Invariants:
 *   - CONFIG_NOT_MANIFEST: token/distributor/chain come from repo-spec, never a claim leaf.
 *   - NODE_SCOPED, PUBLIC_READS_FINALIZED_ONLY (epochsCompleted counts finalized only), NO_SECRETS.
 * Side-effects: IO (HTTP response, database read for finalized-epoch count).
 * Links: nodes/operator/app/src/shared/config/repoSpec.server.ts, nodes/operator/app/src/features/governance/hooks/useNodeTokenomics.ts
 * @public
 */

import { NextResponse } from "next/server";
import { getContainer } from "@/bootstrap/container";
import { wrapPublicRoute } from "@/bootstrap/http";
import { getNodeId, getNodeTokenomicsConfig } from "@/shared/config";

export const dynamic = "force-dynamic";

export const GET = wrapPublicRoute(
  {
    routeId: "attribution.tokenomics.public",
    cacheTtlSeconds: 60,
    staleWhileRevalidateSeconds: 300,
  },
  async (_ctx, _request) => {
    const { tokenAddress, distributorAddress, chainId, distributionsActive } =
      getNodeTokenomicsConfig();

    const store = getContainer().attributionStore;
    const allEpochs = await store.listEpochs(getNodeId());
    const epochsCompleted = allEpochs.filter(
      (e) => e.status === "finalized"
    ).length;

    return NextResponse.json({
      tokenAddress,
      distributorAddress,
      chainId,
      // `distributions.status === "active"` in the node's own repo-spec — the
      // Ownership page's ground truth for the not-activated state (story.5003).
      distributionsActive,
      epochsCompleted,
    });
  }
);
