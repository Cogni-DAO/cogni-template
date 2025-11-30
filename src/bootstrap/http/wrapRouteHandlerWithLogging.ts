// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@bootstrap/http/wrapRouteHandlerWithLogging`
 * Purpose: Route wrapper to eliminate boilerplate for request logging envelope.
 * Scope: Bootstrap-layer utility. Handles ctx creation, timing, and envelope logging only. Does not handle domain-specific events.
 * Invariants: Always logs request start/end; always measures duration; catches all errors and logs them.
 * Side-effects: IO (creates request context, emits structured log entries)
 * Notes: Use this wrapper for all instrumented routes. Domain events go in facades/features, not here.
 *        For unhandled 5xx errors, intentionally emits TWO log entries:
 *        1. logRequestError (error level) - error signal for alerting
 *        2. logRequestEnd (info level) - envelope metric for dashboards
 *        This separation is a standard observability pattern (signals vs metrics).
 * Links: Used by route handlers; delegates to shared/observability helpers.
 * @public
 */

import { type NextRequest, NextResponse } from "next/server";

import { getContainer } from "@/bootstrap/container";
import type { SessionUser } from "@/shared/auth";
import {
  createRequestContext,
  logRequestEnd,
  logRequestError,
  logRequestStart,
  type RequestContext,
} from "@/shared/observability";

type RouteHandler<TContext = unknown> = (
  ctx: RequestContext,
  request: NextRequest,
  sessionUser: SessionUser | null,
  context?: TContext
) => Promise<NextResponse>;

type WrapOptions =
  | {
      routeId: string;
      auth: {
        mode: "required";
        getSessionUser: () => Promise<SessionUser | null>;
      };
    }
  | {
      routeId: string;
      auth: {
        mode: "optional";
        getSessionUser: () => Promise<SessionUser | null>;
      };
    }
  | {
      routeId: string;
      auth?: { mode: "none" };
    };

/**
 * Wraps a route handler with consistent request logging envelope.
 * Handles ctx creation, session check, timing, logRequestStart/End/Error automatically.
 *
 * @param options - Configuration for route logging
 * @param options.routeId - Route identifier for logging (e.g., "payments.intents")
 * @param options.auth - Session authentication config: { mode: "required"|"optional"|"none", getSessionUser }
 * @param handler - Route handler that receives (ctx, request, sessionUser, context?)
 * @returns Next.js route handler function (supports both static and dynamic routes)
 *
 * @example
 * // Static route with required session
 * export const POST = wrapRouteHandlerWithLogging(
 *   { routeId: "payments.intents", auth: { mode: "required", getSessionUser } },
 *   async (ctx, request, sessionUser) => {
 *     const body = await request.json();
 *     const input = paymentIntentOperation.input.parse(body);
 *     const result = await createPaymentIntentFacade({ sessionUser: sessionUser!, ...input }, ctx);
 *     return NextResponse.json(paymentIntentOperation.output.parse(result));
 *   }
 * );
 *
 * @example
 * // Dynamic route (Next.js 15 with async params and typed context)
 * export const GET = wrapRouteHandlerWithLogging<{ params: Promise<{ id: string }> }>(
 *   { routeId: "payments.attempt_status", auth: { mode: "required", getSessionUser } },
 *   async (ctx, request, sessionUser, context) => {
 *     if (!context) throw new Error("context required for dynamic routes");
 *     const { id } = await context.params;
 *     const result = await getPaymentStatusFacade({ sessionUser: sessionUser!, attemptId: id }, ctx);
 *     return NextResponse.json(paymentStatusOperation.output.parse(result));
 *   }
 * );
 */
export function wrapRouteHandlerWithLogging<TContext = unknown>(
  options: WrapOptions,
  handler: RouteHandler<TContext>
): (request: NextRequest, context?: TContext) => Promise<NextResponse> {
  return async (
    request: NextRequest,
    context?: TContext
  ): Promise<NextResponse> => {
    const container = getContainer();

    // Fetch session based on auth mode
    const sessionUser =
      options.auth && options.auth.mode !== "none"
        ? await options.auth.getSessionUser()
        : null;

    const ctx = createRequestContext(
      { baseLog: container.log, clock: container.clock },
      request,
      {
        routeId: options.routeId,
        session: sessionUser ?? undefined,
      }
    );

    logRequestStart(ctx.log);
    const start = Date.now();

    try {
      // Check session requirement before calling handler
      if (options.auth?.mode === "required" && !sessionUser) {
        const status = 401;
        const durationMs = Date.now() - start;
        logRequestEnd(ctx.log, { status, durationMs });
        return NextResponse.json({ error: "Session required" }, { status });
      }

      const response = await handler(ctx, request, sessionUser, context);
      const durationMs = Date.now() - start;
      logRequestEnd(ctx.log, { status: response.status, durationMs });
      return response;
    } catch (error) {
      // Wrapper only catches unhandled errors - route should handle domain errors
      const durationMs = Date.now() - start;
      const status = 500;
      logRequestError(ctx.log, error, "INTERNAL_SERVER_ERROR");
      logRequestEnd(ctx.log, { status, durationMs });
      return NextResponse.json({ error: "Internal server error" }, { status });
    }
  };
}
