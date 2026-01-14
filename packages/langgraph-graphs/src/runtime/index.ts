// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/runtime`
 * Purpose: LangChain runtime utilities for graph execution.
 * Scope: Message converters, tool wrappers, LLM wrapper, async queue. Does not contain graph definitions.
 * Invariants:
 *   - All LangChain imports contained here
 *   - Utilities are pure functions (no side effects)
 *   - CompletionUnitLLM routes through injected CompletionFn
 * Side-effects: none
 * Links: LANGGRAPH_AI.md, TOOL_USE_SPEC.md
 * @public
 */

// Async queue for streaming
export { AsyncQueue } from "./async-queue";
// CompletionUnitLLM wrapper
export {
  type CompletionFn,
  type CompletionResult,
  CompletionUnitLLM,
} from "./completion-unit-llm";
// InProc runtime context (ALS-based)
export {
  getInProcRuntime,
  hasInProcRuntime,
  type InProcRuntime,
  runWithInProcContext,
} from "./inproc-runtime";
// Tool wrappers
export {
  type ToLangChainToolOptions,
  type ToLangChainToolsOptions,
  type ToolExecFn,
  type ToolExecResult,
  toLangChainTool,
  toLangChainTools,
} from "./langchain-tools";
// Message types and converters
export {
  fromBaseMessage,
  type Message,
  type MessageToolCall,
  toBaseMessage,
} from "./message-converters";
