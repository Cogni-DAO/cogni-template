// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/graphs/brain/server`
 * Purpose: LangGraph dev server entrypoint for brain graph.
 * Scope: Thin entrypoint. Does NOT import catalog (type transparency for LangGraph CLI).
 * Invariants:
 *   - LANGGRAPH_JSON_POINTS_TO_SERVER_ONLY: Referenced by langgraph.json
 *   - HELPERS_DO_NOT_IMPORT_CATALOG: Uses makeServerGraph with explicit toolIds
 * Side-effects: process.env (via makeServerGraph)
 * Links: COGNI_BRAIN_SPEC.md, GRAPH_EXECUTION.md
 * @internal
 */

import { makeServerGraph } from "../../runtime/core/make-server-graph";
import { BRAIN_GRAPH_NAME, createBrainGraph } from "./graph";
import { BRAIN_TOOL_IDS } from "./tools";

export const brain = await makeServerGraph({
  name: BRAIN_GRAPH_NAME,
  createGraph: createBrainGraph,
  toolIds: BRAIN_TOOL_IDS,
});
