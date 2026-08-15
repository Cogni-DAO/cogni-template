// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/api/v1/nodes/[id]/attribution/epochs/[eid]/distribution-tx/route`
 * Purpose: Serve the EXECUTE payload for a finalized epoch — everything the node owner's wallet
 *   needs to build ONE Aragon TokenVoting proposal that mints the epoch's delta into the DAO's
 *   cumulative distributor and sets the new merkle root. The fold/worker NEVER sends this tx; this
 *   route only reads what R3 persisted (the manifest header) plus the node's governance addresses
 *   so the owner's wallet can build + submit the proposal (which EarlyExecution executes atomically).
 * Scope: Thin authed read shell — owner-session OR `node.flight` gating (mirrors
 *   `activate-distributions`), resolve `{id}` → node, read the epoch's persisted manifest
 *   (`getDistributionManifestForEpoch`) + the immediately-prior finalized epoch's manifest to
 *   compute the mint delta. No tx, no business logic, no merkle building.
 * Invariants:
 *   - NODE_SCOPED, ALL_MATH_BIGINT (mintDelta serialized as a decimal string), VALIDATE_IO.
 *   - READ_ONLY_SERVES_R3: returns only persisted manifest + node-row governance addresses; never
 *     mutates state and never signs/sends a transaction.
 *   - FINALIZED_AND_RECORDED: gated on epoch finalized + manifest exists + distributorAddress
 *     recorded; otherwise 409 (nothing to execute yet).
 *   - CUMULATIVE_DELTA: mintDelta = thisManifest.distributionAmount − priorManifest.distributionAmount
 *     where prior = most-recent finalized epoch (by id) with a persisted manifest; for the FIRST
 *     distribution (no prior manifest) mintDelta == thisManifest.distributionAmount (cumulativeTotal).
 *   - OWNER_OR_DEVELOPER: node owner session OR `node.flight` authorizes the read.
 * Side-effects: IO (HTTP response, service-db node resolution, OpenFGA check, database read)
 * Links: src/app/api/v1/nodes/[id]/activate-distributions/route.ts,
 *   src/features/governance/components/ExecuteDistributionPanel.tsx,
 *   packages/attribution-ledger/src/store.ts (DistributionManifestStore)
 * @public
 */

import { NextResponse } from "next/server";
import { getSessionUser } from "@/app/_lib/auth/session";
import { resolveNodeAndAuthorize } from "@/app/_lib/node-rbac";
import { getContainer, resolveServiceDb } from "@/bootstrap/container";
import { wrapRouteHandlerWithLogging } from "@/bootstrap/http";
import { nodeIdOrSlug } from "@/features/nodes/node-lookup";
import { nodes } from "@/shared/db/nodes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ROUTE_ID = "nodes.attribution.distribution-tx";

/** DTO the ExecuteDistributionPanel consumes to build the createProposal actions. */
interface DistributionTxDto {
  readonly epochId: string;
  readonly merkleRoot: string;
  /** Cumulative-delta to mint into the distributor this epoch, in base units (decimal string). */
  readonly mintDelta: string;
  readonly distributorAddress: string;
  readonly tokenAddress: string;
  readonly daoAddress: string;
  readonly pluginAddress: string;
  readonly chainId: number;
  /** On-chain root the distributor already carries, if the manifest recorded it (else null). */
  readonly alreadyExecutedRoot: string | null;
}

export const GET = wrapRouteHandlerWithLogging<{
  params: Promise<{ id: string; eid: string }>;
}>(
  {
    routeId: ROUTE_ID,
    auth: { mode: "required", getSessionUser },
  },
  async (ctx, _request, sessionUser, context) => {
    if (!context) throw new Error("context required for dynamic routes");
    const { id, eid } = await context.params;

    let epochId: bigint;
    try {
      epochId = BigInt(eid);
    } catch {
      return NextResponse.json({ error: "invalid epoch id" }, { status: 400 });
    }

    // Resolve the node row (id or slug). We read the node row directly (rather than
    // only `resolveNodeAndAuthorize`) because we need its governance addresses.
    const db = resolveServiceDb();
    const rows = await db.select().from(nodes).where(nodeIdOrSlug(id)).limit(1);
    const node = rows[0];
    if (!node) {
      return NextResponse.json({ error: "node_not_found" }, { status: 404 });
    }

    // OWNER_OR_DEVELOPER: node owner session OR `node.flight` (delegated agent) may read.
    const isOwner = node.ownerUserId === sessionUser.id;
    if (!isOwner) {
      const gate = await resolveNodeAndAuthorize({
        id: node.id,
        userId: sessionUser.id,
        action: "node.flight",
      });
      if (!gate.ok) {
        return NextResponse.json(
          { error: gate.errorCode },
          { status: gate.status }
        );
      }
    }

    const store = getContainer().attributionStore;

    // FINALIZED_AND_RECORDED: the epoch must be finalized before a distribution exists.
    const epoch = await store.getEpoch(epochId);
    if (!epoch || epoch.nodeId !== node.id) {
      return NextResponse.json({ error: "epoch_not_found" }, { status: 404 });
    }
    if (epoch.status !== "finalized") {
      return NextResponse.json(
        { error: "epoch_not_finalized", currentStatus: epoch.status },
        { status: 409 }
      );
    }

    const manifest = await store.getDistributionManifestForEpoch(epochId);
    if (!manifest) {
      return NextResponse.json(
        { error: "no_distribution_manifest" },
        { status: 409 }
      );
    }
    if (!manifest.distributorAddress) {
      // R2/R3 must have recorded the distributor before a mint+setRoot can target it.
      return NextResponse.json(
        { error: "distributor_not_recorded" },
        { status: 409 }
      );
    }

    // The node must carry the DAO + TokenVoting plugin governance addresses so the
    // owner's wallet can submit createProposal to the plugin (executing as the DAO).
    if (!node.daoAddress || !node.pluginAddress) {
      return NextResponse.json(
        {
          error: "node_missing_governance",
          hasDao: Boolean(node.daoAddress),
          hasPlugin: Boolean(node.pluginAddress),
        },
        { status: 409 }
      );
    }

    // CUMULATIVE_DELTA: mint only the increment over the prior distribution. The prior
    // is the most-recent finalized epoch (by id, ascending) BEFORE this one that has a
    // persisted manifest. First distribution ⇒ no prior manifest ⇒ delta == cumulativeTotal.
    const priorManifest = await findPriorManifest(store, node.id, epochId);
    const mintDelta =
      priorManifest === null
        ? manifest.distributionAmount
        : manifest.distributionAmount - priorManifest.distributionAmount;

    if (mintDelta < 0n) {
      // A cumulative total should never shrink. Refuse rather than emit a bad mint.
      return NextResponse.json(
        { error: "negative_mint_delta" },
        { status: 409 }
      );
    }

    const dto: DistributionTxDto = {
      epochId: manifest.epochId.toString(),
      merkleRoot: manifest.merkleRoot,
      mintDelta: mintDelta.toString(),
      distributorAddress: manifest.distributorAddress,
      tokenAddress: manifest.tokenAddress,
      daoAddress: node.daoAddress,
      pluginAddress: node.pluginAddress,
      chainId: manifest.chainId,
      alreadyExecutedRoot: null,
    };

    ctx.log.info(
      {
        event: "node.distribution_tx.served",
        routeId: ROUTE_ID,
        nodeId: node.id,
        slug: node.slug,
        epochId: dto.epochId,
        chainId: dto.chainId,
        isFirstDistribution: priorManifest === null,
      },
      "distribution-tx: execute payload served"
    );

    return NextResponse.json(dto);
  }
);

/**
 * Find the manifest of the most-recent finalized epoch (by ascending id) strictly
 * before `epochId` for `nodeId`. Returns null when none exists (first distribution).
 * ALL_MATH_BIGINT: epoch ids are bigint; comparisons and sorting stay bigint.
 */
async function findPriorManifest(
  store: ReturnType<typeof getContainer>["attributionStore"],
  nodeId: string,
  epochId: bigint
) {
  const epochs = await store.listEpochs(nodeId);
  const priorFinalized = epochs
    .filter((e) => e.status === "finalized" && e.id < epochId)
    .sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)); // descending by id

  for (const e of priorFinalized) {
    const m = await store.getDistributionManifestForEpoch(e.id);
    if (m) return m;
  }
  return null;
}
