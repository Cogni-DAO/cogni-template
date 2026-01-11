// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/graphs/ponderer/graph`
 * Purpose: Philosophical thinker agent graph factory.
 * Scope: Creates LangGraph React agent with philosophical system prompt. Does NOT execute graphs or read env.
 * Invariants:
 *   - Pure factory function — no side effects, no env reads
 *   - LLM and tools are injected, not instantiated
 *   - Uses shared InvokableGraph type (no per-graph interface duplication)
 * Side-effects: none
 * Links: LANGGRAPH_AI.md, AGENT_DEVELOPMENT_GUIDE.md
 * @public
 */

import { createReactAgent } from "@langchain/langgraph/prebuilt";

import {
  asInvokableGraph,
  type CreateReactAgentGraphOptions,
  type InvokableGraph,
  type MessageGraphInput,
  type MessageGraphOutput,
} from "../types";
import { PONDERER_SYSTEM_PROMPT } from "./prompts";

/**
 * Graph name constant for routing.
 */
export const PONDERER_GRAPH_NAME = "ponderer" as const;

/**
 * Ponderer graph type alias.
 * Uses shared InvokableGraph interface — no per-graph interface duplication.
 */
export type PondererGraph = InvokableGraph<
  MessageGraphInput,
  MessageGraphOutput
>;

/**
 * Create a philosophical ponderer agent graph.
 *
 * Same structure as poet graph but with philosophical system prompt.
 * Uses createReactAgent with tool-calling loop.
 *
 * @param opts - Options with LLM and tools
 * @returns Compiled LangGraph ready for invoke()
 */
export function createPondererGraph(
  opts: CreateReactAgentGraphOptions
): PondererGraph {
  const { llm, tools } = opts;

  const agent = createReactAgent({
    llm,
    tools: [...tools], // Spread readonly array to mutable for LangGraph
    messageModifier: PONDERER_SYSTEM_PROMPT,
  });

  // Centralized cast with runtime assertion
  return asInvokableGraph<MessageGraphInput, MessageGraphOutput>(agent);
}
