// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/ai-core/billing/source-system`
 * Purpose: Source system enum for billing attribution across executors.
 * Scope: Defines SOURCE_SYSTEMS const and SourceSystem type. Does NOT implement logic.
 * Invariants:
 *   - SINGLE_SOURCE_OF_TRUTH: This is the canonical definition; src/types re-exports
 *   - Each adapter has exactly one source system for billing attribution
 * Side-effects: none (constants and types only)
 * Links: LANGGRAPH_SERVER.md, GRAPH_EXECUTION.md
 * @public
 */

/**
 * Source systems represent the external system that originated a charge.
 * Used for generic linking in charge_receipts (source_system + source_reference).
 * Per GRAPH_EXECUTION.md: each adapter has a source system for billing attribution.
 */
export const SOURCE_SYSTEMS = ["litellm", "anthropic_sdk"] as const;

export type SourceSystem = (typeof SOURCE_SYSTEMS)[number];
