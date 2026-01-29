// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/runtime`
 * Purpose: LangChain runtime utilities for graph execution.
 * Scope: Message converters, tool wrappers, LLM wrapper, async queue, entrypoint helpers. Does NOT contain graph definitions.
 * Invariants:
 *   - All LangChain imports contained here
 *   - Utilities are pure functions (no side effects)
 *   - CompletionUnitLLM reads from ALS + configurable (no constructor args)
 *   - Tool wrappers: single impl (makeLangChainTools) + two thin wrappers
 * Side-effects: none
 * Links: LANGGRAPH_AI.md, TOOL_USE_SPEC.md
 * @public
 */

// Async queue for streaming
export { AsyncQueue } from "./async-queue";

// CompletionUnitLLM wrapper (no-arg; reads from ALS + configurable)
export {
  type CompletionFn,
  type CompletionResult,
  CompletionUnitLLM,
} from "./completion-unit-llm";
export { createInProcEntrypoint } from "./inproc-entrypoint";
// InProc runtime context (ALS-based)
export {
  getInProcRuntime,
  hasInProcRuntime,
  type InProcRuntime,
  runWithInProcContext,
} from "./inproc-runtime";
// Tool wrappers: core impl + thin wrappers
export {
  // Core implementation
  type ExecResolver,
  type MakeLangChainToolOptions,
  type MakeLangChainToolsOptions,
  makeLangChainTool,
  makeLangChainTools,
  // Deprecated (for backwards compatibility)
  type ToLangChainToolOptions,
  // Thin wrappers
  type ToLangChainToolsInProcOptions,
  type ToLangChainToolsOptions,
  type ToLangChainToolsServerOptions,
  type ToolExecFn,
  type ToolExecResult,
  toLangChainTool,
  toLangChainTools,
  toLangChainToolsInProc,
  toLangChainToolsServer,
} from "./langchain-tools";
// Message types and converters
export {
  fromBaseMessage,
  type Message,
  type MessageToolCall,
  toBaseMessage,
} from "./message-converters";
// Entrypoint helpers (per NO_PER_GRAPH_ENTRYPOINT_WIRING)
export {
  type CreateServerEntrypointOptions,
  createServerEntrypoint,
} from "./server-entrypoint";
