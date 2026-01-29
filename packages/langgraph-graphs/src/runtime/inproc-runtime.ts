// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/runtime/inproc-runtime`
 * Purpose: Per-run runtime context using AsyncLocalStorage for InProc execution.
 * Scope: Holds completionFn, tokenSink, toolExecFn per run. Does not execute tools or LLM calls directly.
 * Invariants:
 *   - RUNTIME_CONTEXT_VIA_ALS: Context accessed via ALS, not global singleton
 *   - NO_MODEL_IN_ALS (#35): Model comes from configurable.model, never ALS
 *   - ALS_ONLY_FOR_NON_SERIALIZABLE_DEPS (#36): ALS holds only completionFn, tokenSink, toolExecFn
 *   - One runtime per run — no cross-run leakage
 *   - Throws if accessed outside of runWithInProcContext
 * Side-effects: none (AsyncLocalStorage is per-run isolation)
 * Links: GRAPH_EXECUTION.md, LANGGRAPH_AI.md
 * @public
 */

import { AsyncLocalStorage } from "node:async_hooks";

import type { AiEvent, ToolExecFn } from "@cogni/ai-core";

import type { CompletionFn } from "./completion-unit-llm";

/**
 * InProc runtime context.
 * Holds per-run dependencies that cannot travel through RunnableConfig.configurable
 * (functions, object instances). Per #35/#36: model is NOT stored here.
 */
export interface InProcRuntime {
  /** Completion function routed through executeCompletionUnit for billing */
  readonly completionFn: CompletionFn;

  /** Synchronous push for token streaming */
  readonly tokenSink: { push: (event: AiEvent) => void };

  /** Tool execution function (routes through toolRunner) */
  readonly toolExecFn: ToolExecFn;
}

/**
 * AsyncLocalStorage for per-run runtime context.
 * Prevents concurrency bugs when multiple runs execute in parallel.
 */
const inProcRuntimeALS = new AsyncLocalStorage<InProcRuntime>();

/**
 * Execute a function within an InProc runtime context.
 * The runtime is available via getInProcRuntime() during execution.
 *
 * @param runtime - Per-run runtime context
 * @param fn - Function to execute within context
 * @returns Result of fn
 *
 * @example
 * ```typescript
 * const result = await runWithInProcContext(
 *   { completionFn, tokenSink, toolExecFn },
 *   () => graph.invoke(input, { configurable })
 * );
 * ```
 */
export function runWithInProcContext<T>(
  runtime: InProcRuntime,
  fn: () => T
): T {
  return inProcRuntimeALS.run(runtime, fn);
}

/**
 * Get the current InProc runtime context.
 * Must be called within runWithInProcContext.
 *
 * @throws Error if called outside of runWithInProcContext
 * @returns Current InProc runtime
 */
export function getInProcRuntime(): InProcRuntime {
  const runtime = inProcRuntimeALS.getStore();
  if (!runtime) {
    throw new Error(
      "getInProcRuntime() called outside of runWithInProcContext. " +
        "Ensure graph invocation is wrapped with runWithInProcContext()."
    );
  }
  return runtime;
}

/**
 * Check if running within an InProc context.
 * Useful for conditional behavior in code that may run in different contexts.
 *
 * @returns true if within runWithInProcContext
 */
export function hasInProcRuntime(): boolean {
  return inProcRuntimeALS.getStore() !== undefined;
}
