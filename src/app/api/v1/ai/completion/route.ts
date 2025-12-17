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

import { NextResponse } from "next/server";

import { completion } from "@/app/_facades/ai/completion.server";
import { getSessionUser } from "@/app/_lib/auth/session";
import { wrapRouteHandlerWithLogging } from "@/bootstrap/http";
import { aiCompletionOperation } from "@/contracts/ai.completion.v1.contract";
import { isAccountsFeatureError } from "@/features/accounts/public";
import { logRequestWarn, type RequestContext } from "@/shared/observability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Local error handler for AI completion route.
 * Maps domain errors to HTTP responses; returns null for unhandled errors.
 */
function handleRouteError(
  ctx: RequestContext,
  error: unknown
): NextResponse | null {
  // Zod validation errors
  if (error && typeof error === "object" && "issues" in error) {
    logRequestWarn(ctx.log, error, "VALIDATION_ERROR");
    return NextResponse.json(
      { error: "Invalid input format" },
      { status: 400 }
    );
  }

  // Accounts feature errors
  if (isAccountsFeatureError(error)) {
    if (error.kind === "INSUFFICIENT_CREDITS") {
      logRequestWarn(ctx.log, error, "INSUFFICIENT_CREDITS");
      return NextResponse.json(
        { error: "Insufficient credits" },
        { status: 402 }
      );
    }
    if (error.kind === "BILLING_ACCOUNT_NOT_FOUND") {
      logRequestWarn(ctx.log, error, "BILLING_ACCOUNT_NOT_FOUND");
      return NextResponse.json({ error: "Account not found" }, { status: 403 });
    }
    if (error.kind === "VIRTUAL_KEY_NOT_FOUND") {
      logRequestWarn(ctx.log, error, "VIRTUAL_KEY_NOT_FOUND");
      return NextResponse.json(
        { error: "Virtual key not found" },
        { status: 403 }
      );
    }
    // Fallback for GENERIC
    logRequestWarn(ctx.log, error, "ACCOUNT_ERROR");
    return NextResponse.json(
      { error: error.kind === "GENERIC" ? error.message : "Account error" },
      { status: 400 }
    );
  }

  // LLM-specific errors
  if (error instanceof Error) {
    if (
      error.message.includes("MESSAGE_TOO_LONG") ||
      error.message.includes("INVALID_CONTENT")
    ) {
      logRequestWarn(ctx.log, error, "MESSAGE_VALIDATION_ERROR");
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (
      error.message.includes("timeout") ||
      error.message.includes("AbortError")
    ) {
      logRequestWarn(ctx.log, error, "REQUEST_TIMEOUT");
      return NextResponse.json({ error: "Request timeout" }, { status: 408 });
    }
    if (error.message.includes("LiteLLM API error: 429")) {
      logRequestWarn(ctx.log, error, "RATE_LIMIT_EXCEEDED");
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429 }
      );
    }
    if (error.message.includes("LiteLLM")) {
      logRequestWarn(ctx.log, error, "LLM_SERVICE_UNAVAILABLE");
      return NextResponse.json(
        { error: "AI service temporarily unavailable" },
        { status: 503 }
      );
    }
  }

  return null; // Unhandled → let wrapper catch as 500
}

export const POST = wrapRouteHandlerWithLogging(
  { routeId: "ai.completion", auth: { mode: "required", getSessionUser } },
  async (ctx, request, sessionUser) => {
    try {
      // Parse JSON body
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return NextResponse.json(
          { error: "Invalid JSON body" },
          { status: 400 }
        );
      }

      // Validate input with contract
      const input = aiCompletionOperation.input.parse(body);

      // Delegate to facade with context
      if (!sessionUser) throw new Error("sessionUser required"); // Enforced by wrapper
      const result = await completion({ ...input, sessionUser }, ctx);

      // Validate output and return
      const output = aiCompletionOperation.output.parse(result);
      return NextResponse.json(output);
    } catch (error) {
      const errorResponse = handleRouteError(ctx, error);
      if (errorResponse) return errorResponse;
      throw error; // Unhandled → wrapper catches
    }
  }
);
