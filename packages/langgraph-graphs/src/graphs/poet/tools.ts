// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/graphs/poet/tools`
 * Purpose: Tool IDs for poet graph (single source of truth).
 * Scope: Exports tool capability metadata. Does NOT enforce policy (that's ToolRunner's job).
 * Invariants:
 *   - SINGLE_SOURCE_OF_TRUTH: This is THE list of tools poet can use
 *   - CAPABILITY_NOT_POLICY: These are capabilities, not authorization
 * Side-effects: none
 * Links: TOOL_USE_SPEC.md, LANGGRAPH_AI.md
 * @public
 */

import { GET_CURRENT_TIME_NAME } from "@cogni/ai-tools";

/**
 * Tool IDs for poet graph.
 * Single source of truth - imported by server.ts, cogni-exec.ts, and catalog.ts.
 */
export const POET_TOOL_IDS = [GET_CURRENT_TIME_NAME] as const;

/**
 * Type for poet tool IDs.
 */
export type PoetToolId = (typeof POET_TOOL_IDS)[number];
