// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/api/internal/attribution/distribution-config`
 * Purpose: Internal endpoint the ledger worker calls at epoch-finalize to resolve the
 *   distribution config (token / emissions holder / distributor / chain) of the node WHOSE
 *   EPOCH IS BEING FINALIZED, read from that node's OWN `.cogni/repo-spec.yaml` at git HEAD.
 * Scope: Auth-protected GET. Delegates to the node-distribution-config resolver (deploy-plane
 *   App-read + `@cogni/repo-spec` extraction). Does not run any finalize/fold logic.
 * Invariants:
 *   - INTERNAL_API_SHARED_SECRET: Requires Bearer SCHEDULER_API_TOKEN.
 *   - SPECS_GIT_AUTHORITATIVE: values come from the node's repo-spec, never env vars.
 *   - WORKER_HOLDS_NO_GITHUB_CRED (bug.5000): this gateway exists so the worker never
 *     fetches GitHub directly.
 *   - `distribution: null` = not activated / permanently unresolvable (fold no-ops);
 *     transient spec-fetch failures are 503 `spec_unavailable`, never a silent null.
 * Side-effects: IO (registry read + GitHub App-reads via injected deploy plane)
 * Links: attribution.distribution-config.internal.v1.contract,
 *   src/features/nodes/node-distribution-config.ts,
 *   services/scheduler-worker/src/adapters/distribution-config-http.ts, bug.5020
 * @internal
 */

import { internalDistributionConfigOperation } from "@cogni/node-contracts";
import { verifySchedulerBearer } from "@cogni/node-shared";
import { NextResponse } from "next/server";
import { resolveNodeDistributionConfigResolver } from "@/bootstrap/container";
import { wrapRouteHandlerWithLogging } from "@/bootstrap/http";
import { DistributionSpecUnavailableError } from "@/features/nodes/node-distribution-config";
import { serverEnv } from "@/shared/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = wrapRouteHandlerWithLogging(
  {
    routeId: "attribution.distribution-config.internal",
    auth: { mode: "none" },
  },
  async (ctx, request) => {
    const env = serverEnv();

    if (
      !verifySchedulerBearer(
        request.headers.get("authorization"),
        env.SCHEDULER_API_TOKEN
      )
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = internalDistributionConfigOperation.input.safeParse({
      nodeId: new URL(request.url).searchParams.get("nodeId"),
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid nodeId", details: parsed.error.issues },
        { status: 400 }
      );
    }

    try {
      const result =
        await resolveNodeDistributionConfigResolver().resolveForNode(
          parsed.data.nodeId
        );
      ctx.log.info(
        {
          event: "attribution.distribution_config_resolved",
          nodeId: result.nodeId,
          active: result.distribution !== null,
          reason: result.reason,
        },
        "resolved node distribution config for finalize fold"
      );
      return NextResponse.json(
        internalDistributionConfigOperation.output.parse(result),
        { status: 200 }
      );
    } catch (err) {
      if (err instanceof DistributionSpecUnavailableError) {
        ctx.log.warn(
          {
            event: "attribution.distribution_config_unavailable",
            nodeId: parsed.data.nodeId,
            err: String(err),
          },
          "transient failure reading node repo-spec for distribution config"
        );
        return NextResponse.json(
          { error: "spec_unavailable" },
          { status: 503 }
        );
      }
      throw err;
    }
  }
);
