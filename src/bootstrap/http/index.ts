// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@bootstrap/http`
 * Purpose: HTTP route utilities for bootstrapping.
 * Scope: Bootstrap-layer exports for route handlers. Does not implement business logic or domain-specific events.
 * Invariants: Provides route logging wrapper.
 * Side-effects: none (re-exports only)
 * Notes: Routes import from here or directly from wrapRouteHandlerWithLogging.
 * Links: Re-exports from bootstrap/http/*.
 * @public
 */

export { wrapRouteHandlerWithLogging } from "./wrapRouteHandlerWithLogging";
