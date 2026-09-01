// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/api/v1/nodes/[id]/attribution/epochs/route`
 * Purpose: Node-addressable read of ANY registered node's ledger epochs from the operator
 *   gateway — the same list the operator-self `/api/v1/attribution/epochs` returns, but for the
 *   node resolved from the `{id}` path segment instead of the operator's own `getNodeId()`.
 *   Lets a node read its own attribution results through the operator.
 * Scope: Thin HTTP shell — auth (bearer-or-session, mirroring the operator-self read), resolve
 *   `{id}` (repo-spec node_id UUID OR slug) AND authorize the caller on it via the shared
 *   `resolveNodeAndAuthorize` seam, then route the read by ownership: the operator's OWN node reads
 *   its local store (`listEpochsForNode`); a FOREIGN node is proxied over HTTP to that node's
 *   internal `/api/internal/attribution/epochs` (OPERATOR_AGGREGATES_ARE_DERIVED). No business logic,
 *   no duplicated aggregation.
 * Invariants: NODE_SCOPED (reads scoped to the resolved nodeId), ALL_MATH_BIGINT, VALIDATE_IO,
 *   PER_NODE_RBAC (hard-reject cross-node reads: the caller must be authorized on THIS node via
 *   `resolveNodeAndAuthorize` — `node.flight`, the developer-tier per-node access relation — or the
 *   route returns 403 `authz_denied` / 503 `authz_unavailable`; unknown node → 404 `node_not_found`),
 *   OPERATOR_AGGREGATES_ARE_DERIVED (foreign epochs are read via the node's internal HTTP API, never
 *   by querying a node DB — the operator holds no cross-node DB creds; DB_PER_NODE / NO_CROSS_NODE_QUERIES).
 * Side-effects: IO (HTTP response, service-db node resolution, OpenFGA check, own-node database read
 *   OR foreign-node internal HTTP read)
 * Links: src/features/attribution/read/epoch-views.ts, src/app/_lib/node-rbac.ts,
 *   src/ports/epochs-read.port.ts, src/adapters/server/ingestion/http-epochs-read.ts,
 *   src/app/api/internal/attribution/epochs/route.ts (foreign-node internal read),
 *   src/app/api/v1/attribution/epochs/route.ts (operator-self twin), bug.5008
 * @public
 */

import { listEpochsOperation } from "@cogni/node-contracts";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/app/_lib/auth/session";
import { resolveNodeAndAuthorize } from "@/app/_lib/node-rbac";
import { getContainer } from "@/bootstrap/container";
import { wrapRouteHandlerWithLogging } from "@/bootstrap/http";
import { listEpochsForNode } from "@/features/attribution/read/epoch-views";
import { type EpochsRead, EpochsReadError } from "@/ports";
import { getNodeId } from "@/shared/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = wrapRouteHandlerWithLogging<{
  params: Promise<{ id: string }>;
}>(
  {
    routeId: "nodes.attribution.list-epochs",
    auth: { mode: "required", getSessionUser },
  },
  async (_ctx, request, sessionUser, context) => {
    if (!context) throw new Error("context required for dynamic routes");
    const { id } = await context.params;

    // Hard-reject cross-node reads: resolve {id} AND authorize the caller on THIS node
    // (`node.flight` = the developer-tier per-node access relation) before returning any of
    // its epochs. Deny → 403 authz_denied; no store → 503 authz_unavailable; unknown → 404.
    const authz = await resolveNodeAndAuthorize({
      id,
      userId: sessionUser.id,
      action: "node.flight",
    });
    if (!authz.ok) {
      return NextResponse.json(
        { error: authz.errorCode },
        { status: authz.status }
      );
    }
    const node = authz.node;

    const url = new URL(request.url);
    const { limit, offset } = listEpochsOperation.input.parse({
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
    });

    // OPERATOR_AGGREGATES_ARE_DERIVED: read the resolved node's epochs from the ledger that owns
    // them. The operator's OWN node is a local store read; a FOREIGN node lives in a DB the operator
    // holds no creds for, so it is proxied over HTTP to that node's internal read endpoint (same
    // dispatch identity the receipt-delivery write plane uses — Bearer SCHEDULER_API_TOKEN).
    const container = getContainer();
    const result =
      node.nodeId === getNodeId()
        ? await listEpochsForNode(container.attributionStore, node.nodeId, {
            limit,
            offset,
          })
        : await readForeignEpochs(container.epochsRead, node.slug, {
            limit,
            offset,
          });

    if ("errorCode" in result) {
      return NextResponse.json(
        { error: result.error, errorCode: result.errorCode },
        { status: result.status }
      );
    }

    return NextResponse.json(listEpochsOperation.output.parse(result));
  }
);

/**
 * A foreign node that does not expose `/api/internal/attribution/epochs` is a KNOWN, permanent
 * state, not a fault — the receiver ships with node-template and older node images predate it
 * (bug.5083). Reporting it as a 500 tells an operator the gateway is broken when the honest answer
 * is "this node cannot serve the read yet"; reporting it as an empty list is the original lie
 * bug.5008 removed. Both hide the same fact, so name it.
 *
 * The adapter still treats 404 as RETRYABLE — a deploy-time race before the node-app has the route
 * is real — so this only classifies the error the caller ultimately receives.
 */
async function readForeignEpochs(
  epochsRead: {
    listEpochsForForeignNode: EpochsRead["listEpochsForForeignNode"];
  },
  slug: string,
  page: { limit: number; offset: number }
): Promise<
  | Awaited<ReturnType<EpochsRead["listEpochsForForeignNode"]>>
  | { error: string; errorCode: string; status: number }
> {
  try {
    return await epochsRead.listEpochsForForeignNode(slug, page);
  } catch (err) {
    if (err instanceof EpochsReadError && err.status === 404) {
      return {
        error: `node '${slug}' does not expose the internal epochs read`,
        errorCode: "node_internal_read_unsupported",
        status: 502,
      };
    }
    if (err instanceof EpochsReadError) {
      return {
        error: `reading node '${slug}' epochs failed upstream`,
        errorCode: "node_internal_read_failed",
        status: 502,
      };
    }
    throw err;
  }
}
