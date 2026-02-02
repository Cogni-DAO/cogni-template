// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/graphs/research/server`
 * Purpose: LangGraph dev server entrypoint for research graph.
 * Scope: Thin entrypoint. Does NOT import catalog (type transparency for LangGraph CLI).
 * Invariants:
 *   - LANGGRAPH_JSON_POINTS_TO_SERVER_ONLY: Referenced by langgraph.json
 *   - HELPERS_DO_NOT_IMPORT_CATALOG: Uses makeServerGraph with explicit toolIds
 * Side-effects: process.env (via makeServerGraph)
 * Links: GRAPH_EXECUTION.md
 * @internal
 */

import { makeServerGraph } from "../../runtime/core/make-server-graph";
import { createResearchGraph, RESEARCH_GRAPH_NAME } from "./graph";
import { RESEARCH_TOOL_IDS } from "./tools";

export const research = await makeServerGraph({
  name: RESEARCH_GRAPH_NAME,
  createGraph: createResearchGraph,
  toolIds: RESEARCH_TOOL_IDS,
});
