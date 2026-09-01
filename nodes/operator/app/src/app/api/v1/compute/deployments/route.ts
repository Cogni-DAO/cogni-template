// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Legacy synchronous compute mutation seam. Git/Argo + ComputeWorkload is the sole writer;
 * keeping this route as an explicit tombstone prevents a second desired-state authority.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/app/_lib/auth/session";
import { resolveNodeAndAuthorize } from "@/app/_lib/node-rbac";
import { wrapRouteHandlerWithLogging } from "@/bootstrap/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ nodeId: z.string().min(1) }).passthrough();

export const POST = wrapRouteHandlerWithLogging(
  {
    routeId: "compute.deployments.create",
    auth: { mode: "required", getSessionUser },
  },
  async (_ctx, request, sessionUser) => {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }
    const gate = await resolveNodeAndAuthorize({
      id: parsed.data.nodeId,
      userId: sessionUser.id,
      action: "node.flight",
    });
    if (!gate.ok) {
      return NextResponse.json(
        { error: gate.errorCode },
        { status: gate.status }
      );
    }
    return NextResponse.json(
      {
        error: "gitops_required",
        message:
          "commit a ComputeWorkload declaration; Git and Argo own compute lifecycle",
      },
      { status: 409 }
    );
  }
);
