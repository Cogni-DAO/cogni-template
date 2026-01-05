// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/graphs/chat/graph`
 * Purpose: Simple React agent graph factory for chat functionality.
 * Scope: Creates LangGraph React agent with injected LLM and tools. Does not execute graphs or read env.
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

/**
 * Graph name constant for routing.
 */
export const CHAT_GRAPH_NAME = "chat" as const;

/**
 * Options for createChatGraph.
 */
export interface CreateChatGraphOptions {
  /** LLM instance (should be CompletionUnitLLM for billing) */
  readonly llm: BaseChatModel;
  /** Tools wrapped via toLangChainTools() */
  readonly tools: StructuredToolInterface[];
  /** Optional system prompt */
  readonly systemPrompt?: string;
}

/**
 * Minimal structural interface for compiled graph.
 * Exposes only the methods we actually use, avoiding LangGraph's complex generics.
 * This is a type firewall — LangGraph internals don't leak into our domain.
 */
export interface ChatGraph {
  invoke(
    input: { messages: BaseMessage[] },
    config?: { signal?: AbortSignal }
  ): Promise<{ messages: BaseMessage[] }>;
}

/**
 * Create a simple React agent graph for chat.
 *
 * This is the simplest possible LangGraph agent:
 * - Uses createReactAgent (prebuilt pattern)
 * - LLM handles tool calling decisions
 * - Agent loops until no more tool calls needed
 *
 * @param opts - Options with LLM and tools
 * @returns Compiled LangGraph ready for invoke()
 *
 * @example
 * ```typescript
 * const llm = new CompletionUnitLLM(completionFn, "gpt-4");
 * const tools = toLangChainTools({ contracts, exec: toolRunner.exec });
 * const graph = createChatGraph({ llm, tools });
 *
 * const result = await graph.invoke({
 *   messages: [new HumanMessage("What time is it?")]
 * });
 * ```
 */
export function createChatGraph(opts: CreateChatGraphOptions): ChatGraph {
  const { llm, tools, systemPrompt } = opts;

  // Use LangGraph's prebuilt React agent
  // This handles the standard ReAct loop:
  // 1. LLM generates response (possibly with tool calls)
  // 2. If tool calls, execute them and loop back
  // 3. If no tool calls, return final response
  const agent = createReactAgent({
    llm,
    tools,
    ...(systemPrompt ? { messageModifier: systemPrompt } : {}),
  });

  // Cast to our minimal structural interface
  return agent as unknown as ChatGraph;
}
