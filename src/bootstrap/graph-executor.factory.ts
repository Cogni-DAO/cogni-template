// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@bootstrap/graph-executor.factory`
 * Purpose: Factory for creating GraphExecutorPort implementations.
 * Scope: Bridges app layer (facades) to adapters layer via bootstrap. Does not contain business logic.
 * Invariants:
 *   - Facade NEVER imports adapters directly (use this factory)
 *   - Per UNIFIED_GRAPH_EXECUTOR: all graph execution flows through GraphExecutorPort
 *   - Per PROVIDER_AGGREGATION: AggregatingGraphExecutor routes to providers
 * Side-effects: none
 * Links: container.ts, AggregatingGraphExecutor, GRAPH_EXECUTION.md
 * @public
 */

import {
  AggregatingGraphExecutor,
  type CompletionStreamFn,
  InProcGraphExecutorAdapter,
  LangGraphInProcProvider,
} from "@/adapters/server";

import type { GraphExecutorPort } from "@/ports";

import { resolveAiAdapterDeps } from "./container";

/**
 * Factory for creating AggregatingGraphExecutor with all configured providers.
 * Per UNIFIED_GRAPH_EXECUTOR: all graph execution flows through GraphExecutorPort.
 * Per PROVIDER_AGGREGATION: AggregatingGraphExecutor routes by graphId to providers.
 * Per CATALOG_SINGLE_SOURCE_OF_TRUTH: Provider imports catalog from @cogni/langgraph-graphs.
 *
 * Architecture boundary: Facade calls this factory (app → bootstrap),
 * factory creates aggregator (bootstrap → adapters). Facade never imports adapters.
 *
 * @param completionStreamFn - Feature function for LLM streaming (from features/ai)
 * @returns GraphExecutorPort implementation (AggregatingGraphExecutor)
 */
export function createGraphExecutor(
  completionStreamFn: CompletionStreamFn
): GraphExecutorPort {
  const deps = resolveAiAdapterDeps();

  // Create InProcGraphExecutorAdapter for completion units
  const inprocAdapter = new InProcGraphExecutorAdapter(
    deps,
    completionStreamFn
  );

  // Create LangGraph provider (imports catalog from package internally)
  const langGraphProvider = new LangGraphInProcProvider(inprocAdapter);

  // Create aggregating executor with all providers
  const aggregator = new AggregatingGraphExecutor([langGraphProvider]);

  return aggregator;
}

/**
 * @deprecated Use createGraphExecutor instead.
 * Kept for backwards compatibility during migration.
 */
export function createInProcGraphExecutor(
  completionStreamFn: CompletionStreamFn
): GraphExecutorPort {
  return createGraphExecutor(completionStreamFn);
}
