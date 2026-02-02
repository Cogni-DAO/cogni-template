// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/graphs`
 * Purpose: Barrel export for graph factories and shared types.
 * Scope: Graph creation functions and type definitions. Does NOT include runners (those live in src/).
 * Invariants:
 *   - Graphs are pure factories — no side effects, no env reads
 *   - All LangChain graph creation code lives here
 *   - Shared types prevent per-graph interface duplication
 * Side-effects: none
 * Links: LANGGRAPH_AI.md, AGENT_DEVELOPMENT_GUIDE.md
 * @public
 */

// Poet graph (poetic AI assistant)
export { createPoetGraph, POET_GRAPH_NAME } from "./poet/graph";
// Ponderer graph (philosophical thinker)
export { createPondererGraph, PONDERER_GRAPH_NAME } from "./ponderer/graph";
// Research graph (deep research with web search)
export { createResearchGraph, RESEARCH_GRAPH_NAME } from "./research/graph";
// Shared graph types
export type {
  CreateReactAgentGraphOptions,
  GraphInvokeOptions,
  InvokableGraph,
  MessageGraphInput,
  MessageGraphOutput,
} from "./types";
