// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@bootstrap/http/wrapRouteHandlerWithLogging`
 * Purpose: Route wrapper to eliminate boilerplate for request logging envelope and metrics.
 * Scope: Bootstrap-layer utility. Handles ctx creation, timing, envelope logging, and Prometheus metrics. Does not implement route-specific business logic.
 * Invariants: Always logs request start/end exactly once; always measures duration; catches unhandled errors; always records metrics (even on 5xx).
 * Side-effects: IO (creates request context, emits structured log entries, records Prometheus metrics)
 * Notes: Use this wrapper for all instrumented routes. Domain events go in facades/features, not here.
 *        logRequestEnd runs exactly once in the finally block for all paths (success, 401, 5xx).
 *        For unhandled errors: logs error, then rethrows in dev/test (APP_ENV != production) for diagnosis.
 *        In production, converts to 500 for safety.
 *        Metrics are recorded in a finally block to ensure all paths are captured.
 * Links: Used by route handlers; delegates to shared/observability helpers; records to shared/observability/server/metrics.
 * @public
 */

import { type NextRequest, NextResponse } from "next/server";

import { getContainer } from "@/bootstrap/container";
import { withRootSpan } from "@/bootstrap/otel";
import type { SessionUser } from "@/shared/auth";
import {
  createRequestContext,
  httpRequestDurationMs,
  httpRequestsTotal,
  logRequestEnd,
  logRequestError,
  logRequestStart,
  type RequestContext,
  statusBucket,
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

    // Get config once before try block to avoid env failures masking real errors
    const { unhandledErrorPolicy } = container.config;

    // Wrap entire request in OTel root span for distributed tracing
    // Per AI_SETUP_SPEC.md: root span bound to context via context.with()
    return withRootSpan(
      `${request.method} ${options.routeId}`,
      { route_id: options.routeId },
      async ({ traceId, span }) => {
        const ctx = createRequestContext(
          { baseLog: container.log, clock: container.clock },
          request,
          {
            routeId: options.routeId,
            traceId,
            session: sessionUser ?? undefined,
          }
        );

        // Per AI_SETUP_SPEC.md: request_id must be on root span for trace-log correlation
        span.setAttribute("request_id", ctx.reqId);

        logRequestStart(ctx.log);
        const start = performance.now();

        // Track response for metrics/logging (captured in try/catch, used in finally)
        let responseStatus = 500;
        let response: NextResponse;

        try {
          // Check session requirement before calling handler
          if (options.auth?.mode === "required" && !sessionUser) {
            responseStatus = 401;
            response = NextResponse.json(
              { error: "Session required" },
              { status: responseStatus }
            );
            return response;
          }

          response = await handler(ctx, request, sessionUser, context);
          responseStatus = response.status;
          return response;
        } catch (error) {
          // Wrapper only catches unhandled errors - route should handle domain errors
          responseStatus = 500;
          logRequestError(ctx.log, error, "INTERNAL_SERVER_ERROR");

          if (unhandledErrorPolicy === "rethrow") {
            throw error;
          }

          // respond_500: convert to 500 for production safety
          response = NextResponse.json(
            { error: "Internal server error" },
            { status: responseStatus }
          );
          return response;
        } finally {
          // Always log request end exactly once and record metrics
          const durationMs = performance.now() - start;

          logRequestEnd(ctx.log, { status: responseStatus, durationMs });

          // Skip metrics recording for scraper endpoint to avoid polluting user traffic metrics
          if (options.routeId !== "meta.metrics") {
            httpRequestsTotal.inc({
              route: options.routeId,
              method: request.method,
              status: statusBucket(responseStatus),
            });
            httpRequestDurationMs.observe(
              { route: options.routeId, method: request.method },
              durationMs
            );
          }
        }
      }
    );
  };
}
