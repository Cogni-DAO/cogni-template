// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/runtime/cogni/entrypoint`
 * Purpose: Shared helper for creating Cogni executor entrypoints.
 * Scope: Wires no-arg CogniCompletionAdapter + ALS-bound tools to graph factory. Does NOT read env or call providers directly.
 * Invariants:
 *   - SYNC_ENTRYPOINT: This function is sync
 *   - NO_PER_GRAPH_ENTRYPOINT_WIRING: All Cogni entrypoints use this shared helper
 *   - NO_CONSTRUCTOR_ARGS: Uses no-arg CogniCompletionAdapter (reads from ALS at invoke)
 *   - TOOLS_VIA_ALS: Tools use toLangChainToolsFromContext which reads toolExecFn from ALS
 * Side-effects: none
 * Links: LANGGRAPH_AI.md, GRAPH_EXECUTION.md
 * @public
 */

import { type CatalogBoundTool, TOOL_CATALOG } from "@cogni/ai-tools";
import type { StructuredToolInterface } from "@langchain/core/tools";

import { LANGGRAPH_CATALOG } from "../../catalog";
import type {
  CreateReactAgentGraphOptions,
  InvokableGraph,
  MessageGraphInput,
  MessageGraphOutput,
} from "../../graphs/types";
import { CogniCompletionAdapter } from "./completion-adapter";
import { toLangChainToolsFromContext } from "./tools";

/**
 * Create a Cogni executor entrypoint.
 *
 * Per SYNC_ENTRYPOINT: This function is sync.
 *
 * Per NO_CONSTRUCTOR_ARGS: Creates no-arg CogniCompletionAdapter that reads
 * completionFn/tokenSink from ALS and model from configurable at invoke time.
 *
 * Per TOOLS_VIA_ALS: Tools use toLangChainToolsFromContext which reads
 * toolExecFn from ALS at invocation time.
 *
 * Per NO_PER_GRAPH_ENTRYPOINT_WIRING: All inproc.ts files use this helper
 * to ensure consistent wiring across all graphs.
 *
 * @param graphName - Graph name (must exist in LANGGRAPH_CATALOG)
 * @param factory - Pure graph factory function
 * @returns Compiled graph ready for invoke (within ALS context)
 *
 * @example
 * ```typescript
 * // packages/langgraph-graphs/src/graphs/poet/inproc.ts
 * import { createCogniEntrypoint } from "../../runtime/cogni/entrypoint";
 * import { createPoetGraph, POET_GRAPH_NAME } from "./graph";
 *
 * export const poetGraph = createCogniEntrypoint(POET_GRAPH_NAME, createPoetGraph);
 * ```
 */
export function createCogniEntrypoint<
  TIn extends MessageGraphInput = MessageGraphInput,
  TOut extends MessageGraphOutput = MessageGraphOutput,
>(
  graphName: string,
  factory: (opts: CreateReactAgentGraphOptions) => InvokableGraph<TIn, TOut>
): InvokableGraph<TIn, TOut> {
  // Lookup catalog entry for tool IDs
  const catalogEntry = LANGGRAPH_CATALOG[graphName];
  if (!catalogEntry) {
    throw new Error(
      `[createCogniEntrypoint] Catalog entry not found for graph: ${graphName}`
    );
  }

  // Resolve bound tools from TOOL_CATALOG
  const boundTools: Readonly<Record<string, CatalogBoundTool>> =
    Object.fromEntries(
      catalogEntry.toolIds
        .map((id) => [id, TOOL_CATALOG[id]] as const)
        .filter(
          (entry): entry is [string, CatalogBoundTool] => entry[1] !== undefined
        )
    );

  // Create no-arg CogniCompletionAdapter (reads from ALS + configurable at invoke)
  const llm = new CogniCompletionAdapter();

  // Convert to LangChain tools (context wrapper reads toolExecFn from ALS)
  const toolContracts = Object.values(boundTools).map((bt) => bt.contract);
  const tools: StructuredToolInterface[] = toLangChainToolsFromContext({
    contracts: toolContracts,
  });

  // Create graph using factory
  return factory({ llm, tools });
}
