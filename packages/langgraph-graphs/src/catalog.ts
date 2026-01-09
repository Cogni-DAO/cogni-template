// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/catalog`
 * Purpose: Single source of truth for LangGraph graph definitions.
 * Scope: Exports LANGGRAPH_CATALOG with all available graphs. Does NOT import from src/.
 * Invariants:
 *   - CATALOG_SINGLE_SOURCE_OF_TRUTH: Graph definitions live here, not in bootstrap
 *   - PACKAGES_NO_SRC_IMPORTS: No imports from src/**
 *   - Adding a graph = add entry here, not touch bootstrap
 * Side-effects: none
 * Links: GRAPH_EXECUTION.md, LANGGRAPH_AI.md
 * @public
 */

import {
  type BoundTool,
  GET_CURRENT_TIME_NAME,
  getCurrentTimeBoundTool,
} from "@cogni/ai-tools";

import { CHAT_GRAPH_NAME, createChatGraph } from "./graphs/chat/graph";
import type { CreateGraphFn } from "./inproc/types";

/**
 * Generic bound tool type for catalog entries.
 * Matches the type in adapter's catalog.ts for structural compatibility.
 */
type AnyBoundTool = BoundTool<
  string,
  unknown,
  unknown,
  Record<string, unknown>
>;

/**
 * Catalog entry shape.
 * Matches LangGraphCatalogEntry<CreateGraphFn> from adapter.
 */
interface CatalogEntry {
  readonly displayName: string;
  readonly description: string;
  readonly boundTools: Readonly<Record<string, AnyBoundTool>>;
  readonly graphFactory: CreateGraphFn;
}

/**
 * LangGraph catalog - single source of truth for graph definitions.
 *
 * To add a new graph:
 * 1. Create graph factory in graphs/<name>/graph.ts
 * 2. Add entry here with boundTools and graphFactory
 * 3. Bootstrap automatically picks it up (no changes needed there)
 *
 * Per CATALOG_SINGLE_SOURCE_OF_TRUTH: graphs are defined here, not in bootstrap.
 */
export const LANGGRAPH_CATALOG: Readonly<Record<string, CatalogEntry>> = {
  /**
   * Chat graph - simple React agent for conversational AI.
   * Uses createReactAgent with tool-calling loop.
   */
  [CHAT_GRAPH_NAME]: {
    displayName: "Chat",
    description: "Conversational AI assistant with tool-calling capabilities",
    boundTools: {
      [GET_CURRENT_TIME_NAME]: getCurrentTimeBoundTool as AnyBoundTool,
    },
    graphFactory: createChatGraph,
  },

  // Phase 5: Add research graph here
  // [RESEARCH_GRAPH_NAME]: {
  //   displayName: "Research",
  //   description: "Research agent with web search and summarization",
  //   boundTools: { ... },
  //   graphFactory: createResearchGraph,
  // },
} as const;

/**
 * Type helper for catalog entry lookup.
 */
export type LangGraphCatalogKeys = keyof typeof LANGGRAPH_CATALOG;
