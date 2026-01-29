// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/runtime/server-entrypoint`
 * Purpose: Shared helper for creating langgraph dev server entrypoints.
 * Scope: Wires LLM + tools to graph factory. Does NOT read env (caller does top-level await).
 * Invariants:
 *   - SYNC_ENTRYPOINT: This function is sync; async LLM init happens in caller via top-level await
 *   - NO_PER_GRAPH_ENTRYPOINT_WIRING: All server entrypoints use this shared helper
 *   - TOOLS_VIA_TOOLRUNNER: Tools use toLangChainToolsServer which captures toolExecFn
 * Side-effects: none
 * Links: LANGGRAPH_AI.md, GRAPH_EXECUTION.md
 * @public
 */

import { type CatalogBoundTool, TOOL_CATALOG } from "@cogni/ai-tools";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { StructuredToolInterface } from "@langchain/core/tools";

import { LANGGRAPH_CATALOG } from "../catalog";
import type {
  CreateReactAgentGraphOptions,
  InvokableGraph,
  MessageGraphInput,
  MessageGraphOutput,
} from "../graphs/types";
import { createDevToolExecFn } from "./dev-tool-exec";
import { toLangChainToolsServer } from "./langchain-tools";

/**
 * Options for createServerEntrypoint.
 */
export interface CreateServerEntrypointOptions {
  /** Pre-built LLM (via top-level await initChatModel in caller) */
  readonly llm: BaseChatModel;
}

/**
 * Create a server entrypoint for langgraph dev.
 *
 * Per SYNC_ENTRYPOINT: This function is sync. Async LLM initialization
 * should happen in the caller via top-level await before calling this.
 *
 * Per NO_PER_GRAPH_ENTRYPOINT_WIRING: All server.ts files use this helper
 * to ensure consistent wiring across all graphs.
 *
 * @param graphName - Graph name (must exist in LANGGRAPH_CATALOG)
 * @param factory - Pure graph factory function
 * @param opts - Options including pre-built LLM
 * @returns Compiled graph ready for invoke
 *
 * @example
 * ```typescript
 * // packages/langgraph-graphs/src/graphs/poet/server.ts
 * import { initChatModel } from "langchain/chat_models/universal";
 * import { createServerEntrypoint } from "../../runtime/server-entrypoint";
 * import { createPoetGraph, POET_GRAPH_NAME } from "./graph";
 *
 * const llm = await initChatModel(undefined, {
 *   configurableFields: ["model"],
 *   modelProvider: "openai",
 *   configuration: { baseURL: process.env.LITELLM_BASE_URL },
 *   apiKey: process.env.LITELLM_MASTER_KEY,
 * });
 *
 * export const poet = createServerEntrypoint(POET_GRAPH_NAME, createPoetGraph, { llm });
 * ```
 */
export function createServerEntrypoint<
  TIn extends MessageGraphInput = MessageGraphInput,
  TOut extends MessageGraphOutput = MessageGraphOutput,
>(
  graphName: string,
  factory: (opts: CreateReactAgentGraphOptions) => InvokableGraph<TIn, TOut>,
  opts: CreateServerEntrypointOptions
): InvokableGraph<TIn, TOut> {
  const { llm } = opts;

  // Lookup catalog entry for tool IDs
  const catalogEntry = LANGGRAPH_CATALOG[graphName];
  if (!catalogEntry) {
    throw new Error(
      `[createServerEntrypoint] Catalog entry not found for graph: ${graphName}`
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

  // Create tool exec function for dev server
  const devToolExecFn = createDevToolExecFn(boundTools);

  // Convert to LangChain tools (server wrapper captures toolExecFn)
  const toolContracts = Object.values(boundTools).map((bt) => bt.contract);
  const tools: StructuredToolInterface[] = toLangChainToolsServer({
    contracts: toolContracts,
    toolExecFn: devToolExecFn,
  });

  // Create graph using factory
  return factory({ llm, tools });
}
