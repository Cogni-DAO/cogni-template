// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/runtime/core/make-server-graph`
 * Purpose: Create compiled graph for langgraph dev server.
 * Scope: Wiring-only helper. Does NOT import LANGGRAPH_CATALOG. Does NOT enforce policy.
 * Invariants:
 *   - HELPERS_DO_NOT_IMPORT_GRAPH_CATALOG: No LANGGRAPH_CATALOG import (type transparency); TOOL_CATALOG allowed
 *   - HELPERS_DO_NOT_ENFORCE_POLICY: Policy is ToolRunner's job
 *   - NO_HIDDEN_DEFAULT_MODEL: Model comes from configurable only (fail-fast at invoke if missing)
 *   - FAIL_FAST_ON_MISSING_TOOLS: Throw if toolIds reference tools not in TOOL_CATALOG
 * Side-effects: process.env (reads LITELLM_BASE_URL, LITELLM_MASTER_KEY)
 * Links: GRAPH_EXECUTION.md, LANGGRAPH_AI.md
 * @public
 */

import { type CatalogBoundTool, TOOL_CATALOG } from "@cogni/ai-tools";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { initChatModel } from "langchain/chat_models/universal";

import type {
  CreateReactAgentGraphOptions,
  InvokableGraph,
  MessageGraphInput,
  MessageGraphOutput,
} from "../../graphs/types";
import { createDevToolExecFn } from "./dev-tool-exec";
import { toLangChainToolsCaptured } from "./langchain-tools";

/**
 * Options for makeServerGraph.
 */
export interface MakeServerGraphOptions<
  TIn extends MessageGraphInput = MessageGraphInput,
  TOut extends MessageGraphOutput = MessageGraphOutput,
> {
  /** Graph name (for error messages) */
  readonly name: string;
  /** Pure graph factory function */
  readonly createGraph: (
    opts: CreateReactAgentGraphOptions
  ) => InvokableGraph<TIn, TOut>;
  /** Tool IDs this graph uses (from per-graph tools.ts) */
  readonly toolIds: readonly string[];
}

/**
 * Create a compiled graph for langgraph dev server.
 *
 * This is an async function because it initializes the LLM via initChatModel.
 * Call with top-level await in server.ts.
 *
 * Per HELPERS_DO_NOT_IMPORT_CATALOG: Takes explicit toolIds, no catalog lookup.
 * Per HELPERS_DO_NOT_ENFORCE_POLICY: Tool wiring only; policy is ToolRunner's job.
 *
 * @param opts - Options with name, createGraph factory, and toolIds
 * @returns Compiled graph ready for invoke
 *
 * @example
 * ```typescript
 * // graphs/poet/server.ts
 * export const poet = await makeServerGraph({
 *   name: POET_GRAPH_NAME,
 *   createGraph: createPoetGraph,
 *   toolIds: POET_TOOL_IDS,
 * });
 * ```
 */
export async function makeServerGraph<
  TIn extends MessageGraphInput = MessageGraphInput,
  TOut extends MessageGraphOutput = MessageGraphOutput,
>(opts: MakeServerGraphOptions<TIn, TOut>): Promise<InvokableGraph<TIn, TOut>> {
  const { name, createGraph, toolIds } = opts;

  // Read env for LiteLLM connection
  // biome-ignore lint/style/noProcessEnv: Dev-only helper
  const baseURL = process.env.LITELLM_BASE_URL ?? "http://localhost:4000";
  // biome-ignore lint/style/noProcessEnv: Dev-only helper
  const apiKey = process.env.LITELLM_MASTER_KEY ?? "dev-key";

  // Initialize configurable LLM (model comes from RunnableConfig.configurable.model)
  // Per CONFIGURABLE_USER_SERVER_SET: include "user" for billing correlation
  const llm = await initChatModel(undefined, {
    configurableFields: ["model", "user"],
    modelProvider: "openai",
    configuration: { baseURL },
    apiKey,
  });

  // Resolve bound tools from TOOL_CATALOG
  const boundTools: Readonly<Record<string, CatalogBoundTool>> =
    Object.fromEntries(
      toolIds
        .map((id) => [id, TOOL_CATALOG[id]] as const)
        .filter(
          (entry): entry is [string, CatalogBoundTool] => entry[1] !== undefined
        )
    );

  // Fail fast if tools missing (per FAIL_FAST_ON_MISSING_TOOLS)
  const missingTools = toolIds.filter((id) => !boundTools[id]);
  if (missingTools.length > 0) {
    throw new Error(
      `[makeServerGraph:${name}] Missing tools in TOOL_CATALOG: ${missingTools.join(", ")}. ` +
        `Ensure all tool IDs in toolIds exist in @cogni/ai-tools TOOL_CATALOG.`
    );
  }

  // Create tool execution function for dev server
  const devToolExecFn = createDevToolExecFn(boundTools);

  // Convert to LangChain tools
  const toolContracts = Object.values(boundTools).map((bt) => bt.contract);
  const tools: StructuredToolInterface[] = toLangChainToolsCaptured({
    contracts: toolContracts,
    toolExecFn: devToolExecFn,
  });

  // Create graph using factory
  return createGraph({ llm, tools });
}
