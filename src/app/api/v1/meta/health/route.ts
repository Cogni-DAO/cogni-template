// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/api/v1/meta/health`
 * Purpose: HTTP endpoint providing health check status for liveness and readiness probes.
 * Scope: Returns service health status. Does not include detailed system diagnostics.
 * Invariants: Always returns valid health schema; status reflects actual service state.
 * Side-effects: IO (HTTP response)
 * Notes: Basic stub implementation; can be extended with database/service checks.
 * Links: \@contracts/meta.health.read.v1.contract, monitoring systems
 * @internal
 */

import { NextResponse } from "next/server";

import { metaHealthOperation } from "@/contracts/meta.health.read.v1.contract";

export const dynamic = "force-static";

export function GET(): NextResponse {
  const payload = {
    status: "healthy" as const,
    timestamp: new Date().toISOString(),
    version: "0",
  };

  const parsed = metaHealthOperation.output.parse(payload);
  return NextResponse.json(parsed);
}
