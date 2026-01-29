// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/runtime/cogni`
 * Purpose: Cogni executor-specific runtime utilities.
 * Scope: ALS execution context, completion adapter, context-resolved tool wrapper, entrypoint helper. Does NOT export core utilities.
 * Invariants:
 *   - USES_ALS: All modules here use or depend on CogniExecContext (AsyncLocalStorage)
 *   - COGNI_SPECIFIC: Not for use by generic LangGraph server
 * Side-effects: none
 * Links: LANGGRAPH_AI.md, GRAPH_EXECUTION.md
 * @public
 */

// Cogni completion adapter (routes through ALS-provided CompletionFn)
export {
  CogniCompletionAdapter,
  type CompletionFn,
  type CompletionResult,
  type TokenSink,
  type ToolCall,
} from "./completion-adapter";

// Cogni entrypoint helper
export { createCogniEntrypoint } from "./entrypoint";

// Cogni execution context (ALS-based)
export {
  type CogniExecContext,
  getCogniExecContext,
  hasCogniExecContext,
  runWithCogniExecContext,
} from "./exec-context";

// Tool wrapper that resolves from ALS context
export {
  type ToLangChainToolsFromContextOptions,
  toLangChainToolsFromContext,
} from "./tools";
