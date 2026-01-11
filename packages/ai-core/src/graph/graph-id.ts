// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/ai-core/graph/graph-id`
 * Purpose: Type definition for namespaced graph identifiers.
 * Scope: Defines GraphId pattern for all graph providers. Does NOT define specific graph IDs (providers do that).
 * Invariants:
 *   - GRAPH_ID_NAMESPACED: format is ${providerId}:${graphName}
 * Side-effects: none
 * Links: GRAPH_EXECUTION.md
 * @public
 */

/**
 * Namespaced graph identifier.
 * Format: "${providerId}:${graphName}" (e.g., "langgraph:poet", "claude_sdk:planner")
 *
 * Per GRAPH_ID_NAMESPACED invariant from GRAPH_EXECUTION.md.
 */
export type GraphId = `${string}:${string}`;
