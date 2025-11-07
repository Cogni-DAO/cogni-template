// SPDX-License-Identifier: Polyform-Shield-1.0.0

/**
 * Purpose: Public surface for shared utilities via re-exports.
 * Scope: Re-exports public utility functions. Does not export internal helpers or types.
 * Invariants: Only re-exports from ./cn; no circular dependencies.
 * Side-effects: none
 * Notes: Changes here affect module's public API contract.
 * Links: ARCHITECTURE.md#public-surface
 * @public
 */
export { cn } from "./cn";
