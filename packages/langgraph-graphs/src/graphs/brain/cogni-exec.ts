// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/graphs/brain/cogni-exec`
 * Purpose: Cogni executor entrypoint for brain graph.
 * Scope: Thin entrypoint. Does NOT import catalog or read env.
 * Invariants:
 *   - HELPERS_DO_NOT_IMPORT_CATALOG: Uses makeCogniGraph with explicit toolIds
 *   - NO_CROSSING_THE_STREAMS: Never imports initChatModel or reads env
 * Side-effects: none
 * Links: COGNI_BRAIN_SPEC.md, GRAPH_EXECUTION.md
 * @public
 */

import { makeCogniGraph } from "../../runtime/cogni/make-cogni-graph";
import { BRAIN_GRAPH_NAME, createBrainGraph } from "./graph";
import { BRAIN_TOOL_IDS } from "./tools";

export const brainGraph = makeCogniGraph({
  name: BRAIN_GRAPH_NAME,
  createGraph: createBrainGraph,
  toolIds: BRAIN_TOOL_IDS,
});
