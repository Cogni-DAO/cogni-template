// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/graphs/research/graph`
 * Purpose: Research graph factory for deep research with web search.
 * Scope: Creates LangGraph React agent with injected LLM and tools. Does NOT execute graphs or read env.
 * Invariants:
 *   - Pure factory function — no side effects, no env reads
 *   - LLM and tools are injected, not instantiated
 *   - TYPE_TRANSPARENT_RETURN: No explicit return type annotation to preserve CompiledStateGraph for CLI schema extraction
 * Side-effects: none
 * Links: LANGGRAPH_AI.md, AGENT_DEVELOPMENT_GUIDE.md
 * @public
 */

import { createReactAgent } from "@langchain/langgraph/prebuilt";

import type { CreateReactAgentGraphOptions } from "../types";
import { RESEARCH_SUPERVISOR_PROMPT } from "./prompts";
import { ResearchStateAnnotation } from "./state";

/**
 * Graph name constant for routing.
 */
export const RESEARCH_GRAPH_NAME = "research" as const;

/**
 * Create a research graph for deep research with web search.
 *
 * MVP Architecture: Single ReAct agent with web search.
 * The agent uses RESEARCH_SUPERVISOR_PROMPT to guide research and report generation.
 *
 * P1: Multi-node StateGraph with explicit supervisor → research/critique subagents:
 *   __start__ → supervisor → supervisor_tools → __end__
 *                   ↑              ↓
 *                   └──────────────┘
 *
 * NOTE: Return type is intentionally NOT annotated to preserve the concrete
 * CompiledStateGraph type for LangGraph CLI schema extraction.
 *
 * @param opts - Options with LLM and tools
 * @returns Compiled LangGraph ready for invoke()
 *
 * @example
 * ```typescript
 * const llm = new CogniCompletionAdapter();
 * const tools = toLangChainTools({ contracts, exec: toolRunner.exec });
 * const graph = createResearchGraph({ llm, tools });
 *
 * const result = await graph.invoke({
 *   messages: [new HumanMessage("Research the current state of quantum computing")]
 * });
 * ```
 */
export function createResearchGraph(opts: CreateReactAgentGraphOptions) {
  const { llm, tools } = opts;

  // MVP: Use LangGraph's prebuilt React agent
  // This handles the standard ReAct loop:
  // 1. LLM generates response (possibly with tool calls)
  // 2. If tool calls, execute them and loop back
  // 3. If no tool calls, return final response (the report)
  //
  // The supervisor prompt guides the agent to:
  // - Conduct thorough research via web search
  // - Synthesize findings
  // - Produce a structured report
  return createReactAgent({
    llm,
    tools: [...tools], // Spread readonly array to mutable for LangGraph
    messageModifier: RESEARCH_SUPERVISOR_PROMPT,
    stateSchema: ResearchStateAnnotation,
  });
}
