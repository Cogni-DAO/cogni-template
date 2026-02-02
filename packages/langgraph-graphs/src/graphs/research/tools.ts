// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/graphs/research/tools`
 * Purpose: Tool IDs for research graph (single source of truth).
 * Scope: Exports tool capability metadata. Does NOT enforce policy (that's ToolRunner's job).
 * Invariants:
 *   - SINGLE_SOURCE_OF_TRUTH: This is THE list of tools research can use
 *   - CAPABILITY_NOT_POLICY: These are capabilities, not authorization
 * Side-effects: none
 * Links: TOOL_USE_SPEC.md, LANGGRAPH_AI.md
 * @public
 */

import { WEB_SEARCH_NAME } from "@cogni/ai-tools";

/**
 * Tool IDs for research graph.
 * Single source of truth - imported by server.ts, cogni-exec.ts, and catalog.ts.
 *
 * MVP: Web search only. File tools and subagent delegation are P1.
 */
export const RESEARCH_TOOL_IDS = [WEB_SEARCH_NAME] as const;

/**
 * Type for research tool IDs.
 */
export type ResearchToolId = (typeof RESEARCH_TOOL_IDS)[number];
