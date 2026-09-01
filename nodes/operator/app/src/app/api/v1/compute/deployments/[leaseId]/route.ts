// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@app/api/v1/compute/deployments/[leaseId]`
 * Purpose: Authenticated compatibility tombstone for former imperative status/release routes.
 * Scope: Owner-gated 409 response directing lifecycle changes through Git/ComputeWorkload.
 * Invariants:
 *   - DEVELOPER_GATED: requires `node.flight` on the node named by `?nodeId=` — v1 has no
 *     lease→node registry, so the caller re-presents the node scope; any flight-granted
 *     principal on that node can read/release (acceptable under the v0 shared-account billing
 *     model; the vNext compute_resources table makes this ownership-scoped).
 *   - SINGLE_WRITER: neither verb touches a provider or bypasses the durable controller ledger.
 * Side-effects: IO (authz check only)
 * Links: ../route.ts, docs/spec/ci-cd.md Axiom 26
 * @public
 */

import { NextResponse } from "next/server";

import { getSessionUser } from "@/app/_lib/auth/session";
import { resolveNodeAndAuthorize } from "@/app/_lib/node-rbac";
import { wrapRouteHandlerWithLogging } from "@/bootstrap/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ leaseId: string }> };

async function gateAndLease(
  context: Ctx | undefined,
  request: Request,
  userId: string
): Promise<
  { ok: true; leaseId: string } | { ok: false; response: NextResponse }
> {
  if (!context) {
    throw new Error("context required for dynamic routes");
  }
  const nodeId = new URL(request.url).searchParams.get("nodeId");
  if (!nodeId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "nodeId_query_required" },
        { status: 400 }
      ),
    };
  }
  const gate = await resolveNodeAndAuthorize({
    id: nodeId,
    userId,
    action: "node.flight",
  });
  if (!gate.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: gate.errorCode },
        { status: gate.status }
      ),
    };
  }
  const { leaseId } = await context.params;
  return { ok: true, leaseId };
}

export const GET = wrapRouteHandlerWithLogging<Ctx>(
  {
    routeId: "compute.deployments.status",
    auth: { mode: "required", getSessionUser },
  },
  async (_ctx, request, sessionUser, context) => {
    // RBAC gate first — 501-vs-200 must not leak provider config to ungranted principals.
    const gated = await gateAndLease(context, request, sessionUser.id);
    if (!gated.ok) return gated.response;
    return NextResponse.json(
      {
        error: "gitops_required",
        message:
          "observe the owner-bound ComputeWorkload status through the GitOps control plane",
      },
      { status: 409 }
    );
  }
);

export const DELETE = wrapRouteHandlerWithLogging<Ctx>(
  {
    routeId: "compute.deployments.release",
    auth: { mode: "required", getSessionUser },
  },
  async (_ctx, request, sessionUser, context) => {
    const gated = await gateAndLease(context, request, sessionUser.id);
    if (!gated.ok) return gated.response;
    return NextResponse.json(
      {
        error: "gitops_required",
        message:
          "remove the owner-bound ComputeWorkload declaration in Git to release compute",
      },
      { status: 409 }
    );
  }
);
