// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/graphs/poet/graph`
 * Purpose: Poetic AI assistant graph factory.
 * Scope: Creates LangGraph React agent with injected LLM and tools. Does NOT execute graphs or read env.
 * Invariants:
 *   - Pure factory function — no side effects, no env reads
 *   - LLM and tools are injected, not instantiated
 *   - Uses shared InvokableGraph type (no per-graph interface duplication)
 * Side-effects: none
 * Links: LANGGRAPH_AI.md, AGENT_DEVELOPMENT_GUIDE.md
 * @public
 */

import { MessagesAnnotation } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

import {
  asInvokableGraph,
  type CreateReactAgentGraphOptions,
  type InvokableGraph,
  type MessageGraphInput,
  type MessageGraphOutput,
} from "../types";
import { POET_SYSTEM_PROMPT } from "./prompts";

/**
 * Graph name constant for routing.
 */
export const POET_GRAPH_NAME = "poet" as const;

/**
 * Poet graph type alias.
 * Uses shared InvokableGraph interface — no per-graph interface duplication.
 */
export type PoetGraph = InvokableGraph<MessageGraphInput, MessageGraphOutput>;

/**
 * Create a poetic AI assistant graph.
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
 * const graph = createPoetGraph({ llm, tools });
 *
 * const result = await graph.invoke({
 *   messages: [new HumanMessage("What time is it?")]
 * });
 * ```
 */
export function createPoetGraph(opts: CreateReactAgentGraphOptions): PoetGraph {
  const { llm, tools } = opts;

  // Use LangGraph's prebuilt React agent
  // This handles the standard ReAct loop:
  // 1. LLM generates response (possibly with tool calls)
  // 2. If tool calls, execute them and loop back
  // 3. If no tool calls, return final response
  const agent = createReactAgent({
    llm,
    tools: [...tools], // Spread readonly array to mutable for LangGraph
    messageModifier: POET_SYSTEM_PROMPT,
    stateSchema: MessagesAnnotation,
  });

  // Centralized cast with runtime assertion
  return asInvokableGraph<MessageGraphInput, MessageGraphOutput>(agent);
}
