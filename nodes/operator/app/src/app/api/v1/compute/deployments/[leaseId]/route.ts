// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@app/api/v1/compute/deployments/[leaseId]`
 * Purpose: GET — poll one provisioned compute workload's state + serving endpoints.
 *   DELETE — release the workload (unspent escrow returns to the shared account). task.5044.
 * Scope: Thin HTTP shell over the injected ComputeResourcePort write half. `leaseId` is the
 *   opaque handle returned by POST ../deployments.
 * Invariants:
 *   - DEVELOPER_GATED: requires `node.flight` on the node named by `?nodeId=` — v1 has no
 *     lease→node registry, so the caller re-presents the node scope; any flight-granted
 *     principal on that node can read/release (acceptable under the v0 shared-account billing
 *     model; the vNext compute_resources table makes this ownership-scoped).
 *   - WRITE_HALF_OPTIONAL: 501 compute_write_unsupported when no workload-capable provider.
 * Side-effects: IO (authz check, provider API read; DELETE closes a live lease)
 * Links: ../route.ts (provision), adapters/server/compute/akash-compute.adapter.ts
 * @public
 */

import { NextResponse } from "next/server";

import { getSessionUser } from "@/app/_lib/auth/session";
import { resolveNodeAndAuthorize } from "@/app/_lib/node-rbac";
import { getContainer } from "@/bootstrap/container";
import { wrapRouteHandlerWithLogging } from "@/bootstrap/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ leaseId: string }> };

async function gateAndLease(
  context: Ctx | undefined,
  request: Request,
  userId: string
): Promise<
  | { ok: true; leaseId: string; slug: string }
  | { ok: false; response: NextResponse }
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
  return { ok: true, leaseId, slug: gate.node.slug };
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
    const compute = getContainer().computeCapability;
    if (!compute.status) {
      return NextResponse.json(
        { error: "compute_write_unsupported" },
        { status: 501 }
      );
    }
    const workload = await compute.status({ leaseId: gated.leaseId });
    return NextResponse.json({ workload });
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
    const compute = getContainer().computeCapability;
    if (!compute.release) {
      return NextResponse.json(
        { error: "compute_write_unsupported" },
        { status: 501 }
      );
    }
    await compute.release({ leaseId: gated.leaseId });
    // task.5053: prune the node's `<slug>-akash` CNAME now that the lease is closed.
    // Best-effort (never throws) — the release result always reaches the caller.
    const dns = await getContainer().computeDnsReconciler.reconcileRelease({
      slug: gated.slug,
    });
    return NextResponse.json({ released: true, leaseId: gated.leaseId, dns });
  }
);
