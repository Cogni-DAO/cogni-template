// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/api/v1/activity/route`
 * Purpose: API endpoint for fetching activity data.
 * Scope: Validates input via contract, delegates to ActivityFacade. Does not implement business logic.
 * Invariants:
 * - Requires authenticated user.
 * - Returns 400 for invalid cursor or input.
 * - Returns 400 for InvalidRangeError.
 * - Returns 401 for unauthorized access.
 * Side-effects: IO
 * Links: [ActivityFacade](../../../_facades/ai/activity.server.ts)
 * @public
 */

import { NextResponse } from "next/server";

import { getActivity } from "@/app/_facades/ai/activity.server";
import { wrapRouteHandlerWithLogging } from "@/bootstrap/http";
import { aiActivityOperation } from "@/contracts/ai.activity.v1.contract";
import { getServerSessionUser } from "@/lib/auth/server";
import { isActivityUsageUnavailableError } from "@/ports";
import { deriveTimeRange } from "@/shared/time/time-range";

export const dynamic = "force-dynamic";

export const GET = wrapRouteHandlerWithLogging(
  {
    routeId: "ai.activity",
    auth: { mode: "required", getSessionUser: getServerSessionUser },
  },
  async (ctx, request, sessionUser) => {
    const { searchParams } = new URL(request.url);

    // Parse and validate input
    const inputResult = aiActivityOperation.input.safeParse({
      range: searchParams.get("range") || undefined,
      from: searchParams.get("from") || undefined,
      to: searchParams.get("to") || undefined,
      step: searchParams.get("step") || undefined,
      cursor: searchParams.get("cursor") || undefined,
      limit: searchParams.has("limit")
        ? Number.parseInt(searchParams.get("limit") || "20", 10)
        : undefined,
    });

    if (!inputResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: inputResult.error.format() },
        { status: 400 }
      );
    }

    try {
      if (!sessionUser) throw new Error("sessionUser required"); // Enforced by wrapper

      // Derive from/to from range preset if provided, otherwise use explicit from/to
      let from: string;
      let to: string;

      if (inputResult.data.range) {
        const { from: derivedFrom, to: derivedTo } = deriveTimeRange(
          inputResult.data.range
        );
        from = derivedFrom.toISOString();
        to = derivedTo.toISOString();
      } else {
        // Custom range (from/to explicitly provided)
        // Safe: Zod refine validates that both from and to exist when range is absent
        if (!inputResult.data.from || !inputResult.data.to) {
          return NextResponse.json(
            { error: "Missing from/to parameters" },
            { status: 400 }
          );
        }
        from = inputResult.data.from;
        to = inputResult.data.to;
      }

      const data = await getActivity({
        from,
        to,
        ...(inputResult.data.step && { step: inputResult.data.step }),
        ...(inputResult.data.cursor && { cursor: inputResult.data.cursor }),
        ...(inputResult.data.limit && { limit: inputResult.data.limit }),
        sessionUser,
        reqId: ctx.reqId,
      });

      return NextResponse.json(data);
    } catch (error) {
      if (error instanceof Error && error.name === "InvalidCursorError") {
        return NextResponse.json(
          { error: "Invalid cursor", details: error.message },
          { status: 400 }
        );
      }

      if (error instanceof Error && error.name === "InvalidRangeError") {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      // P1: LiteLLM is hard dependency - fail loudly with 503
      if (error instanceof Error && isActivityUsageUnavailableError(error)) {
        return NextResponse.json(
          { code: "LITELLM_UNAVAILABLE", error: "Usage logs unavailable" },
          { status: 503 }
        );
      }

      throw error; // Let wrapper handle unexpected errors
    }
  }
);
