// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/runtime`
 * Purpose: LangChain runtime utilities for graph execution.
 * Scope: Re-exports from core/ (generic) and cogni/ (Cogni executor-specific). Does NOT contain implementation logic.
 * Invariants:
 *   - CORE_NO_ALS: core/ modules have no ALS dependencies
 *   - COGNI_USES_ALS: cogni/ modules use CogniExecContext (AsyncLocalStorage)
 * Side-effects: none
 * Links: LANGGRAPH_AI.md, TOOL_USE_SPEC.md
 * @public
 */

// ============================================================================
// Core (generic, no ALS)
// ============================================================================

export {
  // Async queue
  AsyncQueue,
  // Server entrypoint helper
  type CreateServerEntrypointOptions,
  createServerEntrypoint,
  // Tool wrappers
  type ExecResolver,
  // Message types
  fromBaseMessage,
  type MakeLangChainToolOptions,
  type MakeLangChainToolsOptions,
  type Message,
  type MessageToolCall,
  makeLangChainTool,
  makeLangChainTools,
  type ToLangChainToolsCapturedOptions,
  type ToolExecFn,
  type ToolExecResult,
  toBaseMessage,
  toLangChainToolsCaptured,
} from "./core";

// ============================================================================
// Cogni executor-specific (uses ALS)
// ============================================================================

export {
  // Completion adapter
  CogniCompletionAdapter,
  // Execution context
  type CogniExecContext,
  type CompletionFn,
  type CompletionResult,
  // Entrypoint helper
  createCogniEntrypoint,
  getCogniExecContext,
  hasCogniExecContext,
  runWithCogniExecContext,
  type TokenSink,
  type ToLangChainToolsFromContextOptions,
  type ToolCall,
  toLangChainToolsFromContext,
} from "./cogni";
