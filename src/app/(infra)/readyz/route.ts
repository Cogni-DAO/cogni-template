// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/readyz`
 * Purpose: HTTP endpoint providing readiness check with full validation (env, secrets, EVM RPC, Temporal).
 * Scope: Returns service readiness status; validates env, runtime secrets, EVM RPC connectivity, and Temporal connectivity. Does not check DB connectivity yet.
 * Invariants: Always returns valid readyz schema; force-dynamic runtime; returns 503 if env/secrets/infra connectivity invalid.
 * Side-effects: IO (HTTP response, structured logging, network calls to RPC and Temporal)
 * Notes: Used by Docker HEALTHCHECK, deployment validation, K8s readiness probes.
 *        HTTP status is primary truth: 200 = ready, 503 = not ready.
 *        Logs readiness failures for deployment debugging.
 * Links: `@contracts/meta.readyz.read.v1.contract`, src/shared/env/invariants.ts, src/app/(infra)/livez/route.ts
 * @public
 */

import { NextResponse } from "next/server";

import { getContainer } from "@/bootstrap/container";
import { wrapRouteHandlerWithLogging } from "@/bootstrap/http";
import { metaReadyzOperation } from "@/contracts/meta.readyz.read.v1.contract";
import { EnvValidationError, serverEnv } from "@/shared/env";
import {
  assertEvmRpcConfig,
  assertEvmRpcConnectivity,
  assertRuntimeSecrets,
  assertSchedulerWorkerConnectivity,
  assertTemporalConnectivity,
  InfraConnectivityError,
  RuntimeSecretError,
} from "@/shared/env/invariants";
import type { RequestContext } from "@/shared/observability";

export const dynamic = "force-dynamic";

/**
 * Logs readiness check failure with structured context.
 * Called before returning 503 to ensure failures are visible in deployment logs.
 */
function logReadinessFailure(
  ctx: RequestContext,
  error:
    | EnvValidationError
    | RuntimeSecretError
    | InfraConnectivityError
    | Error
): void {
  if (error instanceof EnvValidationError) {
    ctx.log.error(
      {
        reason: error.meta.code,
        missing: error.meta.missing,
        invalid: error.meta.invalid,
      },
      "readiness check failed: invalid environment configuration"
    );
  } else if (error instanceof RuntimeSecretError) {
    ctx.log.error(
      {
        reason: error.code,
        message: error.message,
      },
      "readiness check failed: missing runtime secret"
    );
  } else if (error instanceof InfraConnectivityError) {
    ctx.log.error(
      {
        reason: error.code,
        message: error.message,
      },
      "readiness check failed: infrastructure unreachable"
    );
  } else {
    ctx.log.error(
      {
        reason: "INTERNAL_ERROR",
        error: error.message,
      },
      "readiness check failed: internal error"
    );
  }
}

export const GET = wrapRouteHandlerWithLogging(
  { routeId: "meta.readyz", auth: { mode: "none" } },
  async (ctx): Promise<NextResponse> => {
    try {
      const env = serverEnv();
      const container = getContainer();

      // MVP readiness: Validate env + runtime secrets + EVM RPC + Temporal connectivity
      assertRuntimeSecrets(env);
      assertEvmRpcConfig(env);

      // Test RPC connectivity (3s budget, triggers lazy ViemEvmOnchainClient init)
      // This catches missing/invalid EVM_RPC_URL immediately after deploy
      await assertEvmRpcConnectivity(container.evmOnchainClient, env);

      // Test Temporal connectivity (5s budget, triggers lazy connection)
      // This catches Temporal not running before stack tests execute
      await assertTemporalConnectivity(container.scheduleControl, env);

      // Test scheduler-worker connectivity (5s budget)
      // This ensures the Temporal worker is polling before stack tests run
      await assertSchedulerWorkerConnectivity(env);

      const payload = {
        status: "healthy" as const,
        timestamp: new Date().toISOString(),
        version: "0",
      };

      const parsed = metaReadyzOperation.output.parse(payload);
      return NextResponse.json(parsed);
    } catch (error) {
      // HTTP status is primary truth for K8s: 503 = not ready
      // Log failure before returning 503 for deployment debugging
      if (error instanceof EnvValidationError) {
        logReadinessFailure(ctx, error);
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
        logReadinessFailure(ctx, error);
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

      // Infrastructure connectivity failures (Temporal, etc.)
      if (error instanceof InfraConnectivityError) {
        logReadinessFailure(ctx, error);
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

      // Unknown error - log and return generic 503
      logReadinessFailure(ctx, error as Error);
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
);
