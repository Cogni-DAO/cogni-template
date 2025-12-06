// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@bootstrap/http/wrapPublicRoute`
 * Purpose: Wrapper for public API routes with mandatory rate limiting and caching.
 * Scope: Public route wrapper (/api/v1/public/*); enforces rate limiting, cache headers, standard error shape. Does NOT implement business logic.
 * Invariants: All public routes MUST use this wrapper; rate limit 10 req/min/IP + burst 5; cache headers auto-applied; 429 on rate limit.
 * Side-effects: IO (rate limiter state, request context, metrics)
 * Notes: Wraps wrapRouteHandlerWithLogging; adds rate limiting layer; enforced by CI test.
 * Links: Used by all /api/v1/public/** routes; CI validation in tests/meta/public-route-enforcement.test.ts
 * @public
 */

import { type NextRequest, NextResponse } from "next/server";
import { serverEnv } from "@/shared/env";
import {
  logRequestWarn,
  publicRateLimitExceededTotal,
  type RequestContext,
} from "@/shared/observability";
import { extractClientIp, publicApiLimiter } from "./rateLimiter";
import { wrapRouteHandlerWithLogging } from "./wrapRouteHandlerWithLogging";

export interface PublicRouteConfig {
  routeId: string;
  cacheTtlSeconds?: number; // Default: 60
  staleWhileRevalidateSeconds?: number; // Default: 300
}

type PublicRouteHandler<TContext = unknown> = (
  ctx: RequestContext,
  request: NextRequest,
  context?: TContext
) => Promise<NextResponse>;

/**
 * Wrapper for public API routes with mandatory protections.
 * Applies:
 * - Rate limiting (10 req/min/IP + burst 5)
 * - Cache headers (Cache-Control: public, max-age, stale-while-revalidate)
 * - Standard error shape ({ error: string })
 * - Request logging and metrics via wrapRouteHandlerWithLogging
 *
 * All routes under /api/v1/public/** MUST use this wrapper.
 *
 * @example
 * export const GET = wrapPublicRoute(
 *   { routeId: "analytics.summary", cacheTtlSeconds: 60 },
 *   async (ctx, request) => {
 *     const data = await getSomePublicData();
 *     return NextResponse.json(data);
 *   }
 * );
 */
export function wrapPublicRoute<TContext = unknown>(
  config: PublicRouteConfig,
  handler: PublicRouteHandler<TContext>
): (request: NextRequest, context?: TContext) => Promise<NextResponse> {
  const cacheTtl = config.cacheTtlSeconds ?? 60;
  const swr = config.staleWhileRevalidateSeconds ?? 300;

  return wrapRouteHandlerWithLogging<TContext>(
    {
      routeId: config.routeId,
      auth: { mode: "none" },
    },
    async (ctx, request, _sessionUser, context) => {
      // Rate limiting (enforced for ALL public routes)
      const clientIp = extractClientIp(request);
      const allowed = publicApiLimiter.consume(clientIp);

      if (!allowed) {
        // Log without IP (aggregated metric provides observability)
        const env = serverEnv();
        const deployEnv = env.DEPLOY_ENVIRONMENT ?? "local";

        logRequestWarn(
          ctx.log,
          { routeId: config.routeId, env: deployEnv, zone: "public_api" },
          "RATE_LIMIT_EXCEEDED"
        );

        // Increment counter metric (aggregated, no PII)
        publicRateLimitExceededTotal.inc({
          route: config.routeId,
          env: deployEnv,
        });

        return NextResponse.json(
          { error: "Rate limit exceeded" },
          {
            status: 429,
            headers: {
              "Retry-After": "60",
              "Cache-Control": "public, max-age=5", // Short cache to reduce hammering
            },
          }
        );
      }

      // Call handler
      const response = await handler(ctx, request, context);

      // Auto-apply cache headers to successful responses
      if (response.status >= 200 && response.status < 300) {
        response.headers.set(
          "Cache-Control",
          `public, max-age=${cacheTtl}, stale-while-revalidate=${swr}`
        );
      }

      return response;
    }
  );
}
