// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@types/usage`
 * Purpose: Re-export UsageFact and ExecutorType from @cogni/ai-core.
 * Scope: Shim layer for backwards compatibility. Does NOT define types.
 * Invariants:
 *   - SINGLE_SOURCE_OF_TRUTH: Canonical definitions in @cogni/ai-core
 *   - This file only re-exports; no local type definitions allowed
 * Side-effects: none (re-exports only)
 * Links: packages/ai-core/src/usage/usage.ts, LANGGRAPH_SERVER.md
 * @public
 */

// Re-export from canonical source (per SINGLE_SOURCE_OF_TRUTH invariant)
export type { ExecutorType, UsageFact } from "@cogni/ai-core";
