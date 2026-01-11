// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/graphs/ponderer/graph`
 * Purpose: Philosophical thinker agent graph factory.
 * Scope: Creates LangGraph React agent with philosophical system prompt. Does not execute graphs or read env.
 * Invariants:
 *   - Pure factory function — no side effects, no env reads
 *   - LLM and tools are injected, not instantiated
 *   - Returns LangGraph CompiledGraph
 * Side-effects: none
 * Links: LANGGRAPH_AI.md
 * @public
 */

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { BaseMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

import { PONDERER_SYSTEM_PROMPT } from "./prompts";

/**
 * Graph name constant for routing.
 */
export const PONDERER_GRAPH_NAME = "ponderer" as const;

/**
 * Options for createPondererGraph.
 */
export interface CreatePondererGraphOptions {
  /** LLM instance (should be CompletionUnitLLM for billing) */
  readonly llm: BaseChatModel;
  /** Tools wrapped via toLangChainTools() */
  readonly tools: StructuredToolInterface[];
}

/**
 * Minimal structural interface for compiled graph.
 * Exposes only the methods we actually use, avoiding LangGraph's complex generics.
 */
export interface PondererGraph {
  invoke(
    input: { messages: BaseMessage[] },
    config?: { signal?: AbortSignal }
  ): Promise<{ messages: BaseMessage[] }>;
}

/**
 * Create a philosophical ponderer agent graph.
 *
 * Same structure as chat graph but with philosophical system prompt.
 * Uses createReactAgent with tool-calling loop.
 *
 * @param opts - Options with LLM and tools
 * @returns Compiled LangGraph ready for invoke()
 */
export function createPondererGraph(
  opts: CreatePondererGraphOptions
): PondererGraph {
  const { llm, tools } = opts;

  const agent = createReactAgent({
    llm,
    tools,
    messageModifier: PONDERER_SYSTEM_PROMPT,
  });

  return agent as unknown as PondererGraph;
}
