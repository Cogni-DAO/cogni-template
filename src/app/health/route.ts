// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/health`
 * Purpose: HTTP endpoint providing health check status for liveness and readiness probes.
 * Scope: Returns service health status. Does not include detailed system diagnostics.
 * Invariants: Always returns valid health schema; status reflects actual service state.
 * Side-effects: IO (HTTP response)
 * Notes: Basic stub implementation; can be extended with database/service checks.
 * Links: `@contracts/meta.health.read.v1.contract`, monitoring systems
 * @public
 */

import { NextResponse } from "next/server";

import { metaHealthOperation } from "@/contracts/meta.health.read.v1.contract";
import { EnvValidationError, serverEnv } from "@/shared/env";

export const dynamic = "force-static";

export function GET(): NextResponse {
  try {
    serverEnv();

    const payload = {
      status: "healthy" as const,
      timestamp: new Date().toISOString(),
      version: "0",
    };

    const parsed = metaHealthOperation.output.parse(payload);
    return NextResponse.json(parsed);
  } catch (error) {
    if (error instanceof EnvValidationError) {
      return new NextResponse(
        JSON.stringify({
          status: "error",
          reason: error.meta.code,
          details: error.meta,
        }),
        {
          status: 500,
          headers: { "content-type": "application/json" },
        }
      );
    }

    return new NextResponse(
      JSON.stringify({
        status: "error",
        reason: "INTERNAL_ERROR",
      }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      }
    );
  }
}
