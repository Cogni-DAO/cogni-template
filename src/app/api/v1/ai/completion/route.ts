// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/api/v1/ai/completion`
 * Purpose: HTTP endpoint for AI completion with billing account resolution.
 * Scope: Require session, delegate to completion facade, map feature errors to HTTP codes. Does not handle rate limiting.
 * Invariants: Validates with contract, translates DTOs, handles billing/account errors cleanly
 * Side-effects: IO (HTTP request/response)
 * Notes: Route validates accounts via features layer, maps AccountsFeatureError to HTTP status codes
 * Links: Uses contract for validation, delegates to completion facade, maps feature errors
 * @public
 */

import { type NextRequest, NextResponse } from "next/server";

import { completion } from "@/app/_facades/ai/completion.server";
import { getSessionUser } from "@/app/_lib/auth/session";
import { getContainer } from "@/bootstrap/container";
import { aiCompletionOperation } from "@/contracts/ai.completion.v1.contract";
import { isAccountsFeatureError } from "@/features/accounts/public";
import {
  createRequestContext,
  logRequestEnd,
  logRequestError,
  logRequestStart,
} from "@/shared/observability";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const container = getContainer();
  const sessionUser = await getSessionUser();

  const ctx = createRequestContext(
    { baseLog: container.log, clock: container.clock },
    request,
    {
      routeId: "ai.completion",
      session: sessionUser ?? undefined,
    }
  );

  logRequestStart(ctx.log);
  const start = Date.now();

  try {
    if (!sessionUser) {
      const status = 401;
      logRequestEnd(ctx.log, { status, durationMs: Date.now() - start });
      return NextResponse.json({ error: "Session required" }, { status });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      const status = 400;
      logRequestEnd(ctx.log, { status, durationMs: Date.now() - start });
      return NextResponse.json({ error: "Invalid JSON body" }, { status });
    }

    // Validate input with contract
    const input = aiCompletionOperation.input.parse(body);

    // Delegate to bootstrap facade (returns { message: {...} })
    const result = await completion({ ...input, sessionUser }, ctx);

    // Validate and return output (result already has correct shape)
    const output = aiCompletionOperation.output.parse(result);
    const status = 200;
    logRequestEnd(ctx.log, { status, durationMs: Date.now() - start });
    return NextResponse.json(output, { status });
  } catch (error) {
    // Handle Zod validation errors
    if (error && typeof error === "object" && "issues" in error) {
      const status = 400;
      logRequestError(ctx.log, error, "VALIDATION_ERROR");
      logRequestEnd(ctx.log, { status, durationMs: Date.now() - start });
      return NextResponse.json(
        { error: "Invalid input format", details: error.issues },
        { status }
      );
    }

    // Handle accounts feature errors
    if (isAccountsFeatureError(error)) {
      if (error.kind === "INSUFFICIENT_CREDITS") {
        const status = 402;
        logRequestError(ctx.log, error, "INSUFFICIENT_CREDITS");
        logRequestEnd(ctx.log, { status, durationMs: Date.now() - start });
        return NextResponse.json({ error: "Insufficient credits" }, { status });
      }
      if (error.kind === "BILLING_ACCOUNT_NOT_FOUND") {
        const status = 403;
        logRequestError(ctx.log, error, "BILLING_ACCOUNT_NOT_FOUND");
        logRequestEnd(ctx.log, { status, durationMs: Date.now() - start });
        return NextResponse.json({ error: "Account not found" }, { status });
      }
      if (error.kind === "VIRTUAL_KEY_NOT_FOUND") {
        const status = 403;
        logRequestError(ctx.log, error, "VIRTUAL_KEY_NOT_FOUND");
        logRequestEnd(ctx.log, { status, durationMs: Date.now() - start });
        return NextResponse.json(
          { error: "Virtual key not found" },
          { status }
        );
      }
      // Generic feature error
      const status = 400;
      logRequestError(ctx.log, error, "ACCOUNT_ERROR");
      logRequestEnd(ctx.log, { status, durationMs: Date.now() - start });
      return NextResponse.json(
        { error: error.kind === "GENERIC" ? error.message : "Account error" },
        { status }
      );
    }

    // Handle feature errors (mapped from core validation)
    if (error instanceof Error) {
      if (
        error.message.includes("MESSAGE_TOO_LONG") ||
        error.message.includes("INVALID_CONTENT")
      ) {
        const status = 400;
        logRequestError(ctx.log, error, "MESSAGE_VALIDATION_ERROR");
        logRequestEnd(ctx.log, { status, durationMs: Date.now() - start });
        return NextResponse.json({ error: error.message }, { status });
      }

      if (
        error.message.includes("timeout") ||
        error.message.includes("AbortError")
      ) {
        const status = 408;
        logRequestError(ctx.log, error, "REQUEST_TIMEOUT");
        logRequestEnd(ctx.log, { status, durationMs: Date.now() - start });
        return NextResponse.json({ error: "Request timeout" }, { status });
      }

      if (error.message.includes("LiteLLM API error: 429")) {
        const status = 429;
        logRequestError(ctx.log, error, "RATE_LIMIT_EXCEEDED");
        logRequestEnd(ctx.log, { status, durationMs: Date.now() - start });
        return NextResponse.json({ error: "Rate limit exceeded" }, { status });
      }

      if (error.message.includes("LiteLLM")) {
        const status = 503;
        logRequestError(ctx.log, error, "LLM_SERVICE_UNAVAILABLE");
        logRequestEnd(ctx.log, { status, durationMs: Date.now() - start });
        return NextResponse.json(
          { error: "AI service temporarily unavailable" },
          { status }
        );
      }
    }

    // Generic server error (don't leak internal details)
    const status = 500;
    logRequestError(ctx.log, error, "INTERNAL_SERVER_ERROR");
    logRequestEnd(ctx.log, { status, durationMs: Date.now() - start });
    return NextResponse.json({ error: "Internal server error" }, { status });
  }
}
