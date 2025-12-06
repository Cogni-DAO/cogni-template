// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/api/v1/analytics/summary`
 * Purpose: Public HTTP endpoint for analytics summary with privacy guarantees.
 * Scope: Validates query params with contract schema, delegates to analytics facade, returns cached JSON. Does not perform queries or business logic.
 * Invariants: Public endpoint (no auth); fixed time windows only; aggressive caching (60s); output validated against contract.
 * Side-effects: IO (reads metrics via facade)
 * Notes: Rate limited at Caddy layer (10 req/min/IP); cache headers set per design doc.
 * Links: docs/METRICS_OBSERVABILITY.md, contracts/analytics.summary.v1.contract.ts
 * @public
 */

import { NextResponse } from "next/server";

import { getAnalyticsSummaryFacade } from "@/app/_facades/analytics/summary.server";
import { wrapRouteHandlerWithLogging } from "@/bootstrap/http";
import { analyticsSummaryOperation } from "@/contracts/analytics.summary.v1.contract";
import { logRequestWarn, type RequestContext } from "@/shared/observability";

export const dynamic = "force-dynamic";

/**
 * Local error handler for analytics summary route.
 * Maps domain errors to HTTP responses; returns null for unhandled errors.
 */
function handleRouteError(
  ctx: RequestContext,
  error: unknown
): NextResponse | null {
  // Zod validation errors
  if (error && typeof error === "object" && "issues" in error) {
    logRequestWarn(ctx.log, error, "VALIDATION_ERROR");
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  // Metrics query errors (adapter failures)
  if (
    error instanceof Error &&
    (error.message.includes("Mimir query") || error.message.includes("timeout"))
  ) {
    logRequestWarn(ctx.log, error, "METRICS_QUERY_ERROR");
    return NextResponse.json(
      { error: "Metrics service temporarily unavailable" },
      { status: 503 }
    );
  }

  return null;
}

export const GET = wrapRouteHandlerWithLogging(
  {
    routeId: "analytics.summary",
    auth: { mode: "none" },
  },
  async (ctx, request) => {
    try {
      const { searchParams } = new URL(request.url);
      const window = searchParams.get("window") ?? "7d";

      const input = analyticsSummaryOperation.input.parse({ window });

      const summary = await getAnalyticsSummaryFacade({
        window: input.window,
      });

      // Validate output against contract
      const output = analyticsSummaryOperation.output.parse(summary);

      // Return with aggressive caching
      return NextResponse.json(output, {
        headers: {
          "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        },
      });
    } catch (error) {
      const errorResponse = handleRouteError(ctx, error);
      if (errorResponse) return errorResponse;
      throw error; // Unhandled - let wrapper catch
    }
  }
);
