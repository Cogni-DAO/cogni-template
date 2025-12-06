// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@bootstrap/http`
 * Purpose: HTTP route utilities for bootstrapping.
 * Scope: Bootstrap-layer exports for route handlers; includes rate limiting and public route wrapper. Does not implement business logic or domain-specific events.
 * Invariants: All /api/v1/public/** routes MUST use wrapPublicRoute(); enforced by CI test.
 * Side-effects: none (re-exports only)
 * Notes: Routes import from here or directly from specific modules.
 * Links: Re-exports from bootstrap/http/*; CI enforcement in tests/meta/public-route-enforcement.test.ts.
 * @public
 */

export {
  extractClientIp,
  publicApiLimiter,
  TokenBucketRateLimiter,
} from "./rateLimiter";
export { wrapPublicRoute } from "./wrapPublicRoute";
export { wrapRouteHandlerWithLogging } from "./wrapRouteHandlerWithLogging";
