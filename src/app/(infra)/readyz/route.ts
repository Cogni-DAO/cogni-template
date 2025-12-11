// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/readyz`
 * Purpose: HTTP endpoint providing readiness check with full validation (env, secrets).
 * Scope: Returns service readiness status; validates env and runtime secrets. MVP: env+secrets only. Does not check DB connectivity yet.
 * Invariants: Always returns valid readyz schema; force-dynamic runtime; returns 503 if env/secrets invalid.
 * Side-effects: IO (HTTP response)
 * Notes: Used by Docker HEALTHCHECK, deployment validation, K8s readiness probes.
 *        HTTP status is primary truth: 200 = ready, 503 = not ready.
 * Links: `@contracts/meta.readyz.read.v1.contract`, src/shared/env/invariants.ts, src/app/(infra)/livez/route.ts
 * @public
 */

import { NextResponse } from "next/server";

import { metaReadyzOperation } from "@/contracts/meta.readyz.read.v1.contract";
import { EnvValidationError, serverEnv } from "@/shared/env";
import {
  assertRuntimeSecrets,
  RuntimeSecretError,
} from "@/shared/env/invariants";

export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  try {
    const env = serverEnv();
    // MVP readiness: Validate env + runtime secrets (no DB check yet)
    assertRuntimeSecrets(env);

    const payload = {
      status: "healthy" as const,
      timestamp: new Date().toISOString(),
      version: "0",
    };

    const parsed = metaReadyzOperation.output.parse(payload);
    return NextResponse.json(parsed);
  } catch (error) {
    // HTTP status is primary truth for K8s: 503 = not ready
    if (error instanceof EnvValidationError) {
      return new NextResponse(
        JSON.stringify({
          status: "error",
          reason: error.meta.code,
          details: error.meta,
        }),
        {
          status: 503, // Service Unavailable - not ready
          headers: { "content-type": "application/json" },
        }
      );
    }

    // Runtime secret validation failures (typed error from assertRuntimeSecrets)
    if (error instanceof RuntimeSecretError) {
      return new NextResponse(
        JSON.stringify({
          status: "error",
          reason: error.code,
          message: error.message,
        }),
        {
          status: 503, // Service Unavailable - not ready
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
        status: 503, // Service Unavailable - not ready
        headers: { "content-type": "application/json" },
      }
    );
  }
}
