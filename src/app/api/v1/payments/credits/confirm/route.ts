// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/api/v1/payments/credits/confirm`
 * Purpose: HTTP endpoint to confirm widget payments and credit billing accounts.
 * Scope: Validates request/response with contract, enforces SIWE session, delegates to facade; does not perform database access directly.
 * Invariants: Billing account derived from session only; idempotent on clientPaymentId.
 * Side-effects: IO (writes credit ledger entries and updates billing balance via AccountService port).
 * Notes: Widget payments are frontend-only; no on-chain verification occurs here (OSS mode).
 * Links: docs/DEPAY_PAYMENTS.md
 * @public
 */

import { NextResponse } from "next/server";

import { confirmCreditsPaymentFacade } from "@/app/_facades/payments/credits.server";
import { getSessionUser } from "@/app/_lib/auth/session";
import { wrapRouteHandlerWithLogging } from "@/bootstrap/http";
import { creditsConfirmOperation } from "@/contracts/payments.credits.confirm.v1.contract";
import { logRequestWarn, type RequestContext } from "@/shared/observability";

export const dynamic = "force-dynamic";

/**
 * Local error handler for credits confirm route.
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

  // Auth errors
  if (error instanceof Error && error.message === "AUTH_USER_NOT_FOUND") {
    logRequestWarn(ctx.log, error, "AUTH_USER_NOT_FOUND");
    return NextResponse.json(
      { error: "User not provisioned; please re-authenticate" },
      { status: 401 }
    );
  }

  return null;
}

export const POST = wrapRouteHandlerWithLogging(
  {
    routeId: "payments.credits_confirm",
    auth: { mode: "required", getSessionUser },
  },
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

      // Validate with contract
      const input = creditsConfirmOperation.input.parse(body);

      // Call facade with context
      if (!sessionUser) throw new Error("sessionUser required"); // Enforced by wrapper
      const result = await confirmCreditsPaymentFacade(
        {
          sessionUser,
          ...input,
        },
        ctx
      );

      // Validate output and return
      return NextResponse.json(creditsConfirmOperation.output.parse(result));
    } catch (error) {
      const errorResponse = handleRouteError(ctx, error);
      if (errorResponse) return errorResponse;
      throw error; // Unhandled - let wrapper catch
    }
  }
);
