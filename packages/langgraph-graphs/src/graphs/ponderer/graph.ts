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

/**
 * Graph name constant for routing.
 */
export const PONDERER_GRAPH_NAME = "ponderer" as const;

/**
 * System prompt for the philosophical ponderer.
 * Concise, thoughtful, draws from philosophical traditions.
 */
const PONDERER_SYSTEM_PROMPT = `You are a philosophical thinker who gives concise, profound responses.

Guidelines:
- Be brief but substantive. One clear insight beats many vague ones.
- Draw from philosophical traditions when relevant, but don't lecture.
- Question assumptions. Reframe problems when useful.
- Prefer clarity over complexity. If an idea needs jargon, it needs more thought.
- When asked practical questions, ground philosophy in action.

Respond like a wise friend who happens to have read deeply—not a professor.`;

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
