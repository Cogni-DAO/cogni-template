// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/api/internal/graphs/[graphId]/runs`
 * Purpose: Internal API endpoint for scheduled graph execution.
 * Scope: Auth-protected POST endpoint for scheduler-worker. Does not contain graph execution logic.
 * Invariants:
 *   - INTERNAL_API_SHARED_SECRET: Requires Bearer SCHEDULER_API_TOKEN
 *   - EXECUTION_IDEMPOTENCY_PERSISTED: Uses execution_requests table for deduplication
 *   - GRANT_VALIDATED_TWICE: Re-validates grant (defense-in-depth)
 *   - Uses AiExecutionErrorCode from ai-core (no parallel error system)
 * Side-effects: IO (HTTP request/response, database, graph execution)
 * Links: docs/SCHEDULER_SPEC.md, graphs.run.internal.v1.contract
 * @internal
 */

import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { toUserId } from "@cogni/ids";
import { SYSTEM_ACTOR } from "@cogni/ids/system";
import { NextResponse } from "next/server";
import { getContainer } from "@/bootstrap/container";
import { createGraphExecutor } from "@/bootstrap/graph-executor.factory";
import { wrapRouteHandlerWithLogging } from "@/bootstrap/http";
import {
  InternalGraphRunInputSchema,
  type InternalGraphRunOutput,
} from "@/contracts/graphs.run.internal.v1.contract";
import { executeStream } from "@/features/ai/public.server";
import {
  isGrantExpiredError,
  isGrantNotFoundError,
  isGrantRevokedError,
  isGrantScopeMismatchError,
} from "@/ports";
import { serverEnv } from "@/shared/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Max auth header length to prevent DoS */
const MAX_AUTH_HEADER_LENGTH = 512;
/** Max token length after parsing (before hashing) */
const MAX_TOKEN_LENGTH = 256;

/**
 * Constant-time string comparison using SHA-256 digests.
 */
function safeCompare(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a, "utf8").digest();
  const hashB = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(hashA, hashB);
}

/**
 * Extract bearer token from Authorization header.
 */
function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  if (authHeader.length > MAX_AUTH_HEADER_LENGTH) return null;

  const trimmed = authHeader.trim();
  const lowerPrefix = trimmed.toLowerCase();

  if (!lowerPrefix.startsWith("bearer ")) return null;

  const token = trimmed.slice(7).trim();
  if (token.length > MAX_TOKEN_LENGTH) return null;

  return token;
}

/**
 * Compute SHA256 hash of normalized request payload for idempotency check.
 */
function computeRequestHash(graphId: string, input: unknown): string {
  const normalized = JSON.stringify({ graphId, input });
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

interface RouteParams {
  params: Promise<{ graphId: string }>;
}

/**
 * POST /api/internal/graphs/{graphId}/runs
 *
 * Internal endpoint for scheduled graph execution.
 * Called by scheduler-worker with Bearer SCHEDULER_API_TOKEN.
 *
 * Headers:
 * - Authorization: Bearer {SCHEDULER_API_TOKEN}
 * - Idempotency-Key: {scheduleId}:{scheduledFor}
 *
 * HTTP errors:
 * - 401: Missing/invalid SCHEDULER_API_TOKEN
 * - 403: Grant invalid/expired/revoked/scope mismatch
 * - 404: Graph not found (checked in catalog)
 * - 422: Idempotency conflict (hash mismatch)
 */
export const POST = wrapRouteHandlerWithLogging<RouteParams>(
  { routeId: "graphs.run.internal", auth: { mode: "none" } },
  async (ctx, request, _sessionUser, routeParams) => {
    const env = serverEnv();
    const container = getContainer();
    const log = ctx.log;

    // --- 1. Bearer token auth ---
    const configuredToken = env.SCHEDULER_API_TOKEN;
    if (!configuredToken) {
      log.error("SCHEDULER_API_TOKEN not configured");
      return NextResponse.json(
        { error: "Service not configured" },
        { status: 500 }
      );
    }

    const authHeader = request.headers.get("authorization");
    const providedToken = extractBearerToken(authHeader);

    if (!providedToken || !safeCompare(providedToken, configuredToken)) {
      log.warn("Invalid or missing SCHEDULER_API_TOKEN");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // --- 2. Extract graphId from path ---
    if (!routeParams) {
      log.error("Route params missing");
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const params = await routeParams.params;
    const graphId = params.graphId;
    if (!graphId) {
      log.warn("Missing graphId in path");
      return NextResponse.json({ error: "Graph not found" }, { status: 404 });
    }

    // --- 3. Idempotency-Key header (required) ---
    const idempotencyKey = request.headers.get("idempotency-key");
    if (!idempotencyKey) {
      log.warn("Missing Idempotency-Key header");
      return NextResponse.json(
        { error: "Idempotency-Key header required" },
        { status: 400 }
      );
    }

    // --- 4. Parse request body ---
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parseResult = InternalGraphRunInputSchema.safeParse(body);
    if (!parseResult.success) {
      log.warn({ errors: parseResult.error.issues }, "Invalid request body");
      return NextResponse.json(
        { error: "Invalid request body", details: parseResult.error.issues },
        { status: 400 }
      );
    }

    const { executionGrantId, input, runId: providedRunId } = parseResult.data;

    // --- 5. Compute request hash for idempotency ---
    const requestHash = computeRequestHash(graphId, input);

    // --- 6. Check idempotency ---
    const idempotencyResult =
      await container.executionRequestPort.checkIdempotency(
        idempotencyKey,
        requestHash
      );

    if (idempotencyResult.status === "cached") {
      // Already processed - return cached result with original outcome
      const cached = idempotencyResult.request;
      log.info(
        { idempotencyKey, runId: cached.runId, ok: cached.ok },
        "Returning cached result"
      );
      // Use explicit branching for discriminated union type narrowing
      if (cached.ok) {
        const cachedResponse: InternalGraphRunOutput = {
          ok: true,
          runId: cached.runId,
          traceId: cached.traceId,
        };
        return NextResponse.json(cachedResponse, { status: 200 });
      } else {
        const cachedResponse: InternalGraphRunOutput = {
          ok: false,
          runId: cached.runId,
          traceId: cached.traceId,
          error: cached.errorCode ?? "internal",
        };
        return NextResponse.json(cachedResponse, { status: 200 });
      }
    }

    if (idempotencyResult.status === "pending") {
      // Execution in progress - return 409 Conflict to signal retry later
      const pending = idempotencyResult.request;
      log.info(
        { idempotencyKey, runId: pending.runId },
        "Execution already in progress"
      );
      return NextResponse.json(
        {
          error: "Execution in progress",
          message:
            "Request with this Idempotency-Key is currently being processed",
          runId: pending.runId,
        },
        { status: 409 }
      );
    }

    if (idempotencyResult.status === "mismatch") {
      // Same idempotency key but different payload - reject
      log.warn(
        {
          idempotencyKey,
          existingHash: idempotencyResult.existingHash,
          providedHash: idempotencyResult.providedHash,
        },
        "Idempotency key conflict"
      );
      return NextResponse.json(
        {
          error: "Idempotency conflict",
          message:
            "Request with same Idempotency-Key but different payload already processed",
        },
        { status: 422 }
      );
    }

    // --- 7. Validate grant (defense-in-depth) ---
    let grant: Awaited<
      ReturnType<
        typeof container.executionGrantWorkerPort.validateGrantForGraph
      >
    >;
    try {
      grant = await container.executionGrantWorkerPort.validateGrantForGraph(
        SYSTEM_ACTOR,
        executionGrantId,
        graphId
      );
    } catch (error) {
      if (isGrantNotFoundError(error)) {
        log.warn({ executionGrantId }, "Grant not found");
        return NextResponse.json({ error: "Grant not found" }, { status: 403 });
      }
      if (isGrantExpiredError(error)) {
        log.warn({ executionGrantId }, "Grant expired");
        return NextResponse.json({ error: "Grant expired" }, { status: 403 });
      }
      if (isGrantRevokedError(error)) {
        log.warn({ executionGrantId }, "Grant revoked");
        return NextResponse.json({ error: "Grant revoked" }, { status: 403 });
      }
      if (isGrantScopeMismatchError(error)) {
        log.warn({ executionGrantId, graphId }, "Grant scope mismatch");
        return NextResponse.json(
          { error: "Grant scope mismatch" },
          { status: 403 }
        );
      }
      throw error;
    }

    // --- 8. Resolve billing account for virtualKeyId ---
    const billingAccount =
      await container.serviceAccountService.getBillingAccountById(
        grant.billingAccountId
      );

    if (!billingAccount) {
      log.error(
        { billingAccountId: grant.billingAccountId },
        "Billing account not found"
      );
      return NextResponse.json(
        { error: "Billing account not found" },
        { status: 500 }
      );
    }

    // --- 9. Execute graph ---
    // Use provided runId (from scheduler-worker) or generate if not provided
    // Per SCHEDULER_SPEC.md: Canonical runId shared with schedule_runs and charge_receipts
    const runId = providedRunId ?? randomUUID();

    // Use OTel trace ID (same one passed to executor, used by Langfuse decorator)
    const traceId = ctx.traceId;

    log.info(
      { graphId, runId, executionGrantId, idempotencyKey, traceId },
      "Starting scheduled graph execution"
    );

    // --- 9a. Create pending idempotency record BEFORE execution ---
    // This ensures the record exists even if execution fails/times out
    await container.executionRequestPort.createPendingRequest(
      idempotencyKey,
      requestHash,
      runId,
      traceId
    );

    // Build caller from grant + billing account
    const caller = {
      billingAccountId: grant.billingAccountId,
      virtualKeyId: billingAccount.defaultVirtualKeyId,
      requestId: ctx.reqId,
      traceId: ctx.traceId,
      userId: grant.userId,
    };

    // Parse input for graph execution
    const messages = Array.isArray(input.messages)
      ? (input.messages as { role: string; content: string }[])
      : [];
    const model =
      typeof input.model === "string" ? input.model : "openrouter/auto";

    // Create graph executor and run
    const executor = createGraphExecutor(executeStream, toUserId(grant.userId));
    const result = executor.runGraph({
      runId,
      ingressRequestId: runId,
      graphId,
      messages: messages.map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      })),
      model,
      caller,
    });

    // Consume stream and wait for final result
    for await (const _event of result.stream) {
      // Drain stream to completion
    }

    const final = await result.final;

    // --- 10. Finalize idempotency record with outcome ---
    await container.executionRequestPort.finalizeRequest(idempotencyKey, {
      ok: final.ok,
      errorCode: final.error ?? null,
    });

    // --- 11. Return result ---
    if (final.ok) {
      log.info({ runId, graphId }, "Scheduled graph execution completed");
      const successResponse: InternalGraphRunOutput = {
        ok: true,
        runId,
        traceId,
      };
      return NextResponse.json(successResponse, { status: 200 });
    } else {
      log.warn(
        { runId, graphId, error: final.error },
        "Scheduled graph execution failed"
      );
      const errorResponse: InternalGraphRunOutput = {
        ok: false,
        runId,
        traceId,
        error: final.error ?? "internal",
      };
      return NextResponse.json(errorResponse, { status: 200 });
    }
  }
);
