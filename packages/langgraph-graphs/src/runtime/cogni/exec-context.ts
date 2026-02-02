// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/runtime/cogni/exec-context`
 * Purpose: Per-run execution context using AsyncLocalStorage for Cogni executor.
 * Scope: Holds completionFn, tokenSink, toolExecFn per run. Does not execute tools or LLM calls directly.
 * Invariants:
 *   - RUNTIME_CONTEXT_VIA_ALS: Context accessed via ALS, not global singleton
 *   - NO_MODEL_IN_ALS (#35): Model comes from configurable.model, never ALS
 *   - ALS_ONLY_FOR_NON_SERIALIZABLE_DEPS (#36): ALS holds only completionFn, tokenSink, toolExecFn
 *   - One context per run — no cross-run leakage
 *   - Throws if accessed outside of runWithCogniExecContext
 * Side-effects: none (AsyncLocalStorage is per-run isolation)
 * Links: GRAPH_EXECUTION.md, LANGGRAPH_AI.md
 * @public
 */

import { AsyncLocalStorage } from "node:async_hooks";

import type { AiEvent, ToolExecFn } from "@cogni/ai-core";

import type { CompletionFn } from "./completion-adapter";

/**
 * Cogni execution context.
 * Holds per-run dependencies that cannot travel through RunnableConfig.configurable
 * (functions, object instances). Per #35/#36: model is NOT stored here.
 */
export interface CogniExecContext {
  /** Completion function routed through executeCompletionUnit for billing */
  readonly completionFn: CompletionFn;

  /** Synchronous push for token streaming */
  readonly tokenSink: { push: (event: AiEvent) => void };

  /** Tool execution function (routes through toolRunner) */
  readonly toolExecFn: ToolExecFn;
}

/**
 * AsyncLocalStorage for per-run execution context.
 * Prevents concurrency bugs when multiple runs execute in parallel.
 */
const cogniExecContextALS = new AsyncLocalStorage<CogniExecContext>();

/**
 * Execute a function within a Cogni execution context.
 * The context is available via getCogniExecContext() during execution.
 *
 * @param context - Per-run execution context
 * @param fn - Function to execute within context
 * @returns Result of fn
 *
 * @example
 * ```typescript
 * const result = await runWithCogniExecContext(
 *   { completionFn, tokenSink, toolExecFn },
 *   () => graph.invoke(input, { configurable })
 * );
 * ```
 */
export function runWithCogniExecContext<T>(
  context: CogniExecContext,
  fn: () => T
): T {
  return cogniExecContextALS.run(context, fn);
}

/**
 * Get the current Cogni execution context.
 * Must be called within runWithCogniExecContext.
 *
 * @throws Error if called outside of runWithCogniExecContext
 * @returns Current Cogni execution context
 */
export function getCogniExecContext(): CogniExecContext {
  const context = cogniExecContextALS.getStore();
  if (!context) {
    throw new Error(
      "getCogniExecContext() called outside of runWithCogniExecContext. " +
        "Ensure graph invocation is wrapped with runWithCogniExecContext()."
    );
  }
  return context;
}

/**
 * Check if running within a Cogni execution context.
 * Useful for conditional behavior in code that may run in different contexts.
 *
 * @returns true if within runWithCogniExecContext
 */
export function hasCogniExecContext(): boolean {
  return cogniExecContextALS.getStore() !== undefined;
}
