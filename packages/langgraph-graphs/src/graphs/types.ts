// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/graphs/types`
 * Purpose: Shared graph type definitions for all LangGraph agents.
 * Scope: Type firewall for LangGraph generics. Does NOT implement graph logic.
 * Invariants:
 *   - SINGLE_INVOKABLE_INTERFACE: All graphs implement InvokableGraph<I,O>
 *   - LANGCHAIN_ALIGNED: Uses RunnableConfig/RunnableInterface from @langchain/core
 * Side-effects: none (types + one runtime assertion)
 * Links: LANGGRAPH_AI.md, AGENT_DEVELOPMENT_GUIDE.md
 * @public
 */

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { BaseMessage } from "@langchain/core/messages";
import type {
  RunnableConfig,
  RunnableInterface,
} from "@langchain/core/runnables";
import type { StructuredToolInterface } from "@langchain/core/tools";

/**
 * Options for graph invocation.
 * Alias to Partial<RunnableConfig> matching RunnableInterface.invoke() signature.
 *
 * Includes: signal, configurable, metadata, tags, callbacks, runId, timeout, etc.
 */
export type GraphInvokeOptions = Partial<RunnableConfig>;

/**
 * Generic invokable graph interface.
 * Type firewall: exposes only invoke() from RunnableInterface.
 *
 * @typeParam I - Input type (e.g., { messages: BaseMessage[] })
 * @typeParam O - Output type (e.g., { messages: BaseMessage[] })
 */
export type InvokableGraph<I, O> = Pick<RunnableInterface<I, O>, "invoke">;

/**
 * Centralized cast with runtime assertion.
 * Validates that the object implements invoke() before casting.
 *
 * @throws Error if graph does not implement invoke()
 */
export function asInvokableGraph<I, O>(g: unknown): InvokableGraph<I, O> {
  if (!g || typeof (g as Record<string, unknown>).invoke !== "function") {
    const actualType = g === null ? "null" : typeof g;
    const keys = g && typeof g === "object" ? Object.keys(g).join(", ") : "n/a";
    throw new Error(
      `Graph does not implement invoke(). Got ${actualType} with keys: [${keys}]`
    );
  }
  return g as InvokableGraph<I, O>;
}

/**
 * Standard input/output types for message-based graphs.
 */
export type MessageGraphInput = { readonly messages: readonly BaseMessage[] };
export type MessageGraphOutput = { readonly messages: BaseMessage[] };

/**
 * Base options for React agent graph factories.
 * Extend per-graph when additional dependencies are needed.
 */
export interface CreateReactAgentGraphOptions {
  /** LLM instance (should be CompletionUnitLLM for billing) */
  readonly llm: BaseChatModel;
  /** Tools wrapped via toLangChainTools() */
  readonly tools: ReadonlyArray<StructuredToolInterface>;
}
