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

import { GET_CURRENT_TIME_NAME } from "@cogni/ai-tools";

import { createPoetGraph, POET_GRAPH_NAME } from "./graphs/poet/graph";
import {
  createPondererGraph,
  PONDERER_GRAPH_NAME,
} from "./graphs/ponderer/graph";
import type { CreateGraphFn } from "./inproc/types";

/**
 * Catalog entry shape.
 *
 * Per TOOL_CATALOG_IS_CANONICAL: graphs reference tools by ID, not by BoundTool.
 * Providers resolve tools from TOOL_CATALOG using these IDs.
 */
interface CatalogEntry {
  readonly displayName: string;
  readonly description: string;
  /** Tool IDs this graph may use. Providers resolve from TOOL_CATALOG. */
  readonly toolIds: readonly string[];
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
   * Poet graph - poetic AI assistant.
   * Uses createReactAgent with tool-calling loop.
   */
  [POET_GRAPH_NAME]: {
    displayName: "Poet",
    description: "Poetic AI assistant with structured verse responses",
    toolIds: [GET_CURRENT_TIME_NAME],
    graphFactory: createPoetGraph,
  },

  /**
   * Ponderer graph - philosophical thinker agent.
   * Same tools as poet, but with philosophical system prompt.
   */
  [PONDERER_GRAPH_NAME]: {
    displayName: "Ponderer",
    description: "Philosophical thinker with concise, profound responses",
    toolIds: [GET_CURRENT_TIME_NAME],
    graphFactory: createPondererGraph,
  },
} as const;

/**
 * Type helper for catalog entry lookup (short names).
 */
export type LangGraphCatalogKeys = keyof typeof LANGGRAPH_CATALOG;

/**
 * LangGraph provider ID for namespacing.
 */
export const LANGGRAPH_PROVIDER_ID = "langgraph" as const;

/**
 * Fully-qualified graph IDs satisfying GraphId from @cogni/ai-core.
 * Per GRAPH_ID_NAMESPACED: format is ${providerId}:${graphName}
 */
export const LANGGRAPH_GRAPH_IDS = {
  poet: `${LANGGRAPH_PROVIDER_ID}:${POET_GRAPH_NAME}`,
  ponderer: `${LANGGRAPH_PROVIDER_ID}:${PONDERER_GRAPH_NAME}`,
} as const;

/**
 * Union type of all valid LangGraph graph IDs.
 */
export type LangGraphGraphId =
  (typeof LANGGRAPH_GRAPH_IDS)[keyof typeof LANGGRAPH_GRAPH_IDS];

/**
 * Default graph ID.
 */
export const DEFAULT_LANGGRAPH_GRAPH_ID = LANGGRAPH_GRAPH_IDS.poet;
