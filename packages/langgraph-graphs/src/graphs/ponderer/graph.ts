// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/graphs/ponderer/graph`
 * Purpose: Philosophical thinker agent graph factory.
 * Scope: Creates LangGraph React agent with philosophical system prompt. Does NOT execute graphs or read env.
 * Invariants:
 *   - Pure factory function — no side effects, no env reads
 *   - LLM and tools are injected, not instantiated
 *   - TYPE_TRANSPARENT_RETURN: No explicit return type annotation to preserve CompiledStateGraph for CLI schema extraction
 * Side-effects: none
 * Links: LANGGRAPH_AI.md, AGENT_DEVELOPMENT_GUIDE.md
 * @public
 */

import { MessagesAnnotation } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

import type { CreateReactAgentGraphOptions } from "../types";
import { PONDERER_SYSTEM_PROMPT } from "./prompts";

/**
 * Graph name constant for routing.
 */
export const PONDERER_GRAPH_NAME = "ponderer" as const;

/**
 * Create a philosophical ponderer agent graph.
 *
 * Same structure as poet graph but with philosophical system prompt.
 * Uses createReactAgent with tool-calling loop.
 *
 * NOTE: Return type is intentionally NOT annotated to preserve the concrete
 * CompiledStateGraph type for LangGraph CLI schema extraction.
 *
 * @param opts - Options with LLM and tools
 * @returns Compiled LangGraph ready for invoke()
 */
export function createPondererGraph(opts: CreateReactAgentGraphOptions) {
  const { llm, tools } = opts;

  return createReactAgent({
    llm,
    tools: [...tools], // Spread readonly array to mutable for LangGraph
    messageModifier: PONDERER_SYSTEM_PROMPT,
    stateSchema: MessagesAnnotation,
  });
}
