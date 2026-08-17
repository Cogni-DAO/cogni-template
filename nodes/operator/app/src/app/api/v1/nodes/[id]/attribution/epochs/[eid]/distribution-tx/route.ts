// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/api/v1/nodes/[id]/attribution/epochs/[eid]/distribution-tx/route`
 * Purpose: Serve the EXECUTE payload for a finalized epoch — everything a scoped publisher wallet
 *   needs to mint the unpublished cumulative delta into the distributor and set the new merkle root
 *   via one direct DAO.execute call. The fold/worker NEVER sends this tx; this route only reads what
 *   R3 persisted plus the live distributor root and the node's DAO address.
 * Scope: Thin SIWE-authenticated read shell. Resolve `{id}` → node, read the epoch's persisted manifest
 *   (`getDistributionManifestForEpoch`) and reconciles the live root to a persisted manifest before
 *   computing the mint delta. No tx, no merkle building.
 * Invariants:
 *   - NODE_SCOPED, ALL_MATH_BIGINT (mintDelta serialized as a decimal string), VALIDATE_IO.
 *   - READ_ONLY_SERVES_R3: returns only persisted manifest + node-row governance addresses; never
 *     mutates state and never signs/sends a transaction.
 *   - FINALIZED_AND_RECORDED: gated on epoch finalized + manifest exists + distributorAddress
 *     recorded; otherwise 409 (nothing to execute yet).
 *   - LATEST_MANIFEST_ONLY: a superseded cumulative manifest is never offered for publish; doing so
 *     would set an old root and recompute an unsafe historical delta.
 *   - CUMULATIVE_DELTA: mintDelta = thisManifest.distributionAmount − liveManifest.distributionAmount.
 *     A zero live root means zero has been published; a nonzero root must match a prior persisted
 *     manifest or publication state is unknown and no payload is served.
 *   - ACTION_AUTHORITY_ON_CHAIN: inputs are non-secret; DAO.hasPermission gates the write action.
 * Side-effects: IO (HTTP response, service-db node resolution, database + RPC reads)
 * Links: src/app/api/v1/nodes/[id]/activate-distributions/route.ts,
 *   src/features/governance/components/ExecuteDistributionPanel.tsx,
 *   packages/attribution-ledger/src/store.ts (DistributionManifestStore)
 * @public
 */

import { CHAINS } from "@cogni/node-shared";
import { NextResponse } from "next/server";
import { type Address, createPublicClient, http } from "viem";
import { base, sepolia } from "viem/chains";
import { getSessionUser } from "@/app/_lib/auth/session";
import { getContainer, resolveServiceDb } from "@/bootstrap/container";
import { wrapRouteHandlerWithLogging } from "@/bootstrap/http";
import { nodeIdOrSlug } from "@/features/nodes/node-lookup";
import { nodes } from "@/shared/db/nodes";
import { serverEnv } from "@/shared/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ROUTE_ID = "nodes.attribution.distribution-tx";
const ZERO_ROOT =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

// Map a NODE's chain id to its viem chain object (mirrors activate-distributions).
// Chain ids come from the shared CHAINS registry (never hardcode — no-restricted-syntax).
const VIEM_CHAINS_BY_ID: Record<number, typeof base | typeof sepolia> = {
  [CHAINS.BASE.chainId]: base,
  [CHAINS.SEPOLIA.chainId]: sepolia,
};

// Minimal ABI to read the cumulative distributor's live merkle root.
const MERKLE_ROOT_ABI = [
  {
    type: "function",
    name: "merkleRoot",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bytes32" }],
  },
] as const;

/**
 * Read the distributor's live on-chain merkle root, or null when it can't be read.
 * (unsupported chain, no RPC, or an RPC error). bug.5022: this is the SERVER-SIDE
 * publish backstop — the client-only guard missed the re-fold-changed-root case. A publish payload
 * is never served from an unknown state: an unreadable root could already be
 * live, so offering mint(delta) would reopen the double-mint path.
 */
async function readLiveMerkleRoot(
  chainId: number | null,
  distributorAddress: string
): Promise<string | null> {
  const viemChain = chainId == null ? null : VIEM_CHAINS_BY_ID[chainId];
  const rpcUrl = serverEnv().EVM_RPC_URL;
  if (!viemChain || !rpcUrl) return null;
  try {
    const client = createPublicClient({
      chain: viemChain,
      transport: http(rpcUrl),
    });
    const root = await client.readContract({
      address: distributorAddress as Address,
      abi: MERKLE_ROOT_ABI,
      functionName: "merkleRoot",
    });
    return typeof root === "string" ? root : null;
  } catch {
    return null;
  }
}

/** DTO the ExecuteDistributionPanel consumes to build the createProposal actions. */
interface DistributionTxDto {
  readonly epochId: string;
  readonly merkleRoot: string;
  /** Cumulative-delta to mint into the distributor this epoch, in base units (decimal string). */
  readonly mintDelta: string;
  readonly distributorAddress: string;
  readonly tokenAddress: string;
  readonly daoAddress: string;
  readonly chainId: number;
  /** Current scoped condition validates action shape but does not prevent replay. */
  readonly executionSafety: "legacy_shape_only";
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
  async (ctx, _request, _sessionUser, context) => {
    if (!context) throw new Error("context required for dynamic routes");
    const { id, eid } = await context.params;

    let epochId: bigint;
    try {
      epochId = BigInt(eid);
    } catch {
      return NextResponse.json({ error: "invalid epoch id" }, { status: 400 });
    }

    // Resolve the node row (id or slug) because the payload needs its governance addresses.
    const db = resolveServiceDb();
    const rows = await db.select().from(nodes).where(nodeIdOrSlug(id)).limit(1);
    const node = rows[0];
    if (!node) {
      return NextResponse.json({ error: "node_not_found" }, { status: 404 });
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

    // LATEST_MANIFEST_ONLY: cumulative roots supersede earlier roots. Re-offering an older manifest
    // would rotate the distributor backwards and its historical delta no longer describes the live
    // cumulative funding state. Only the newest folded epoch may be published.
    const latestManifest = await findLatestManifest(store, node.id);
    if (latestManifest && latestManifest.epochId !== epochId) {
      return NextResponse.json(
        {
          error: "superseded_manifest",
          latestEpochId: latestManifest.epochId.toString(),
        },
        { status: 409 }
      );
    }

    // Publishing calls DAO.execute directly. TokenVoting is not in this per-epoch path.
    if (!node.daoAddress) {
      return NextResponse.json(
        {
          error: "node_missing_governance",
          hasDao: Boolean(node.daoAddress),
        },
        { status: 409 }
      );
    }

    // Reconcile the LIVE root before computing any delta. Persisted-but-unpublished manifests do
    // not count as funded. This prevents under-minting after several folds and prevents double-mint
    // when the live root is ahead of stale UI state.
    const alreadyExecutedRoot = await readLiveMerkleRoot(
      manifest.chainId,
      manifest.distributorAddress
    );
    if (alreadyExecutedRoot === null) {
      return NextResponse.json(
        { error: "publication_state_unknown" },
        { status: 503 }
      );
    }
    if (
      alreadyExecutedRoot.toLowerCase() === manifest.merkleRoot.toLowerCase()
    ) {
      ctx.log.info(
        {
          event: "node.distribution_tx.already_published",
          routeId: ROUTE_ID,
          nodeId: node.id,
          slug: node.slug,
          epochId: manifest.epochId.toString(),
          merkleRoot: `${manifest.merkleRoot.slice(0, 12)}...`,
        },
        "distribution-tx: refused — epoch root already live on-chain (already_published)"
      );
      return NextResponse.json(
        { error: "already_published", merkleRoot: manifest.merkleRoot },
        { status: 409 }
      );
    }

    const liveManifest =
      alreadyExecutedRoot.toLowerCase() === ZERO_ROOT
        ? null
        : await findManifestByRoot(
            store,
            node.id,
            epochId,
            manifest.distributorAddress,
            alreadyExecutedRoot
          );
    if (alreadyExecutedRoot.toLowerCase() !== ZERO_ROOT && !liveManifest) {
      ctx.log.warn(
        {
          event: "node.distribution_tx.live_root_unmatched",
          routeId: ROUTE_ID,
          nodeId: node.id,
          epochId: manifest.epochId.toString(),
        },
        "distribution-tx: live root does not match a prior persisted manifest"
      );
      return NextResponse.json(
        { error: "publication_state_unknown" },
        { status: 503 }
      );
    }

    const publishedTotal = liveManifest?.distributionAmount ?? 0n;
    const mintDelta = manifest.distributionAmount - publishedTotal;
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
      chainId: manifest.chainId,
      executionSafety: "legacy_shape_only",
      alreadyExecutedRoot,
    };

    ctx.log.info(
      {
        event: "node.distribution_tx.served",
        routeId: ROUTE_ID,
        nodeId: node.id,
        slug: node.slug,
        epochId: dto.epochId,
        chainId: dto.chainId,
        publishedThroughEpochId: liveManifest?.epochId.toString() ?? null,
      },
      "distribution-tx: execute payload served"
    );

    return NextResponse.json(dto);
  }
);

/**
 * Match a nonzero live root to a prior persisted cumulative manifest. Distributor identity is
 * included so a stale root from a replaced distributor cannot be treated as funded state.
 */
async function findManifestByRoot(
  store: ReturnType<typeof getContainer>["attributionStore"],
  nodeId: string,
  epochId: bigint,
  distributorAddress: string,
  liveRoot: string
) {
  const epochs = await store.listEpochs(nodeId);
  const priorFinalized = epochs
    .filter((e) => e.status === "finalized" && e.id < epochId)
    .sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)); // descending by id

  for (const e of priorFinalized) {
    const m = await store.getDistributionManifestForEpoch(e.id);
    if (
      m?.distributorAddress?.toLowerCase() ===
        distributorAddress.toLowerCase() &&
      m.merkleRoot.toLowerCase() === liveRoot.toLowerCase()
    ) {
      return m;
    }
  }
  return null;
}

/** Most-recent finalized epoch carrying a persisted cumulative manifest. */
async function findLatestManifest(
  store: ReturnType<typeof getContainer>["attributionStore"],
  nodeId: string
) {
  const epochs = await store.listEpochs(nodeId);
  const finalizedDesc = epochs
    .filter((epoch) => epoch.status === "finalized")
    .sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));

  for (const epoch of finalizedDesc) {
    const manifest = await store.getDistributionManifestForEpoch(epoch.id);
    if (manifest) return manifest;
  }
  return null;
}
