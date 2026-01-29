// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/graphs/poet/cogni-exec`
 * Purpose: Cogni executor entrypoint for poet graph.
 * Scope: Delegates to shared helper. Does NOT read env or initialize LLM directly.
 * Invariants:
 *   - ENTRYPOINT_IS_THIN: Only helper call
 *   - NO_CROSSING_THE_STREAMS: Never imports initChatModel or reads env
 * Side-effects: none
 * Links: GRAPH_EXECUTION.md
 * @public
 */

import { createCogniEntrypoint } from "../../runtime/cogni/entrypoint";
import { createPoetGraph, POET_GRAPH_NAME } from "./graph";

export const poetGraph = createCogniEntrypoint(
  POET_GRAPH_NAME,
  createPoetGraph
);
