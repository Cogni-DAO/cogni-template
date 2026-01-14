// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/graphs/poet/dev`
 * Purpose: Pre-compiled poet graph for LangGraph dev server.
 * Scope: Dev-only entrypoint. Reads env, instantiates LLM. NOT for production use.
 * Invariants:
 *   - Only used by langgraph.json for dev server
 *   - Uses LiteLLM via ChatOpenAI adapter
 *   - TOOL_SAME_PATH_ALL_EXECUTORS: Tools bound at compile time, policy via configurable.toolIds
 *   - TOOLS_VIA_TOOLRUNNER: Tool execution through createDevToolExecFn
 * Side-effects: process.env
 * Links: LANGGRAPH_SERVER.md, TOOL_USE_SPEC.md
 * @internal
 */

import { type CatalogBoundTool, TOOL_CATALOG } from "@cogni/ai-tools";
import { ChatOpenAI } from "@langchain/openai";

import { LANGGRAPH_CATALOG } from "../../catalog";
import { createDevToolExecFn } from "../../runtime/dev-tool-exec";
import { toLangChainTools } from "../../runtime/langchain-tools";

import { createPoetGraph, POET_GRAPH_NAME } from "./graph";

/**
 * Create LLM configured for LiteLLM proxy.
 * Uses OpenAI-compatible API via LiteLLM.
 *
 * P1: Move to langgraph-server package with proper config injection.
 */
function createDevLLM(): ChatOpenAI {
  // biome-ignore lint/style/noProcessEnv: Dev-only entrypoint, P1 will use config injection
  const baseURL = process.env.LITELLM_BASE_URL ?? "http://localhost:4000";
  // biome-ignore lint/style/noProcessEnv: Dev-only entrypoint, P1 will use config injection
  const apiKey = process.env.LITELLM_MASTER_KEY ?? "dev-key";

  return new ChatOpenAI({
    // MVP: Hardcoded. P1: Pass model via LangGraph configurable at runtime.
    model: "devstral",
    configuration: { baseURL },
    apiKey,
  });
}

/**
 * Get bound tools for poet graph from catalog.
 * Per TOOL_CATALOG_IS_CANONICAL: Resolve tools from TOOL_CATALOG by ID.
 */
const catalogEntry = LANGGRAPH_CATALOG[POET_GRAPH_NAME];
if (!catalogEntry) {
  throw new Error(`Catalog entry not found for graph: ${POET_GRAPH_NAME}`);
}
// Resolve boundTools from TOOL_CATALOG (per TOOL_CATALOG_IS_CANONICAL)
const boundTools: Readonly<Record<string, CatalogBoundTool>> =
  Object.fromEntries(
    catalogEntry.toolIds
      .map((id) => [id, TOOL_CATALOG[id]] as const)
      .filter(
        (entry): entry is [string, CatalogBoundTool] => entry[1] !== undefined
      )
  );

/**
 * Create tool execution function for dev server.
 * Per TOOLS_VIA_TOOLRUNNER: Delegates to createToolRunner.
 */
const devToolExecFn = createDevToolExecFn(boundTools);

/**
 * Convert tool contracts to LangChain format.
 * Per TOOL_CONFIG_PROPAGATION: Wrapper checks configurable.toolIds at runtime.
 */
const toolContracts = Object.values(boundTools).map((bt) => bt.contract);
const tools = toLangChainTools({
  contracts: toolContracts,
  exec: devToolExecFn,
});

/**
 * Pre-compiled poet graph for LangGraph dev server.
 * Exported as `poet` to match langgraph.json graph name.
 *
 * Tools are bound at compile time. Runtime authorization via
 * RunnableConfig.configurable.toolIds (passed from LangGraphDevProvider).
 */
export const poet = createPoetGraph({
  llm: createDevLLM(),
  tools,
});
