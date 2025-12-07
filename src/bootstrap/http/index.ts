// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@bootstrap/http`
 * Purpose: HTTP route utilities for bootstrapping.
 * Scope: Bootstrap-layer exports; creates bound wrapPublicRoute singleton lazily. Does NOT handle request-scoped lifecycle or business logic.
 * Invariants: All /api/v1/public/** routes MUST use wrapPublicRoute(); enforced by CI test.
 * Side-effects: global (lazy container init on first wrapPublicRoute call)
 * Notes: wrapPublicRoute bound once on first use; routes get stable wrapper without triggering container init at import time.
 * Links: Re-exports from bootstrap/http/*; CI enforcement in tests/meta/public-route-enforcement.test.ts.
 * @public
 */

import type { NextRequest } from "next/server";
import { getContainer } from "@/bootstrap/container";
import { publicApiLimiter } from "./rateLimiter";
import { makeWrapPublicRoute, type PublicRouteConfig } from "./wrapPublicRoute";

export {
  extractClientIp,
  publicApiLimiter,
  TokenBucketRateLimiter,
} from "./rateLimiter";
export { wrapRouteHandlerWithLogging } from "./wrapRouteHandlerWithLogging";

// Lazy singleton - initialized on first use to avoid module-load container init
let _wrapPublicRoute: ReturnType<typeof makeWrapPublicRoute> | null = null;

/**
 * Public route wrapper - bound to container config singleton.
 * Lazily initialized on first use; all routes share the same deps.
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
  handler: Parameters<ReturnType<typeof makeWrapPublicRoute>>[1]
): (request: NextRequest, context?: TContext) => Promise<Response> {
  if (!_wrapPublicRoute) {
    const container = getContainer();
    _wrapPublicRoute = makeWrapPublicRoute({
      rateLimitBypass: container.config.rateLimitBypass,
      rateLimiter: publicApiLimiter,
      DEPLOY_ENVIRONMENT: container.config.DEPLOY_ENVIRONMENT,
    });
  }
  return _wrapPublicRoute(config, handler);
}
