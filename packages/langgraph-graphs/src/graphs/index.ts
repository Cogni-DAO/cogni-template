// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/graphs`
 * Purpose: Barrel export for graph factories.
 * Scope: Graph creation functions. Does NOT include runners (those live in src/).
 * Invariants:
 *   - Graphs are pure factories — no side effects, no env reads
 *   - All LangChain graph creation code lives here
 *   - Runners in src/ wire dependencies and execute graphs
 * Side-effects: none
 * Links: LANGGRAPH_AI.md
 * @public
 */

// Chat graph
export {
  CHAT_GRAPH_NAME,
  type ChatGraph,
  type CreateChatGraphOptions,
  createChatGraph,
} from "./chat/graph";

// Ponderer graph (philosophical thinker)
export {
  type CreatePondererGraphOptions,
  createPondererGraph,
  PONDERER_GRAPH_NAME,
  type PondererGraph,
} from "./ponderer/graph";
