// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/graphs/poet/cogni-exec`
 * Purpose: Cogni executor entrypoint for poet graph.
 * Scope: Thin entrypoint. Does NOT import catalog or read env.
 * Invariants:
 *   - HELPERS_DO_NOT_IMPORT_CATALOG: Uses makeCogniGraph with explicit toolIds
 *   - NO_CROSSING_THE_STREAMS: Never imports initChatModel or reads env
 * Side-effects: none
 * Links: GRAPH_EXECUTION.md
 * @public
 */

import { makeCogniGraph } from "../../runtime/cogni/make-cogni-graph";
import { createPoetGraph, POET_GRAPH_NAME } from "./graph";
import { POET_TOOL_IDS } from "./tools";

export const poetGraph = makeCogniGraph({
  name: POET_GRAPH_NAME,
  createGraph: createPoetGraph,
  toolIds: POET_TOOL_IDS,
});
