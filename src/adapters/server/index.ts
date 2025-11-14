// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server`
 * Purpose: Hex entry file for server adapters - canonical import surface.
 * Scope: Re-exports only public server adapter implementations with named exports. Does not export test doubles or internal utilities.
 * Invariants: Named exports only, no export *, runtime implementations
 * Side-effects: none (at import time - adapters have runtime effects when instantiated)
 * Notes: Enforces architectural boundaries via ESLint entry-point rules
 * Links: Used by bootstrap layer for DI container assembly
 * @public
 */

export { LiteLlmAdapter } from "./ai/litellm.adapter";
export { SystemClock } from "./time/system.adapter";
