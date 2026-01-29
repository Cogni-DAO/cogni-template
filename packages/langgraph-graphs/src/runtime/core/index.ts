// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/runtime/core`
 * Purpose: Generic LangChain utilities with no ALS dependencies.
 * Scope: Message converters, async queue, tool wrappers (captured exec), server entrypoint helper. Does NOT use AsyncLocalStorage.
 * Invariants:
 *   - NO_ALS_IMPORTS: Core modules do not import from cogni/ or use AsyncLocalStorage
 *   - REUSABLE: These utilities can be used by any LangGraph executor
 * Side-effects: none
 * Links: LANGGRAPH_AI.md
 * @public
 */

// Async queue for streaming
export { AsyncQueue } from "./async-queue";

// Tool wrappers (core impl + captured wrapper)
export {
  type ExecResolver,
  type MakeLangChainToolOptions,
  type MakeLangChainToolsOptions,
  makeLangChainTool,
  makeLangChainTools,
  type ToLangChainToolsCapturedOptions,
  type ToolExecFn,
  type ToolExecResult,
  toLangChainToolsCaptured,
} from "./langchain-tools";

// Message types and converters
export {
  fromBaseMessage,
  type Message,
  type MessageToolCall,
  toBaseMessage,
} from "./message-converters";

// Server entrypoint helper (for langgraph dev)
export {
  type CreateServerEntrypointOptions,
  createServerEntrypoint,
} from "./server-entrypoint";
