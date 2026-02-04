// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@bootstrap/graph-executor.factory`
 * Purpose: Factory for creating GraphExecutorPort implementations with observability.
 * Scope: Bridges app layer (facades) to adapters layer via bootstrap. Does not contain business logic.
 * Invariants:
 *   - Facade NEVER imports adapters directly (use this factory)
 *   - Per UNIFIED_GRAPH_EXECUTOR: all graph execution flows through GraphExecutorPort
 *   - Per PROVIDER_AGGREGATION: AggregatingGraphExecutor routes to providers
 *   - Per LANGFUSE_INTEGRATION: ObservabilityGraphExecutorDecorator wraps for Langfuse traces
 * Side-effects: none
 * Links: container.ts, AggregatingGraphExecutor, GRAPH_EXECUTION.md, OBSERVABILITY.md
 * @public
 */

import type { UserId } from "@cogni/ids";
import { LANGGRAPH_CATALOG } from "@cogni/langgraph-graphs";
import {
  AggregatingGraphExecutor,
  type CompletionStreamFn,
  createLangGraphDevClient,
  InProcCompletionUnitAdapter,
  LangGraphDevProvider,
  LangGraphInProcProvider,
  ObservabilityGraphExecutorDecorator,
} from "@/adapters/server";
import type { GraphExecutorPort } from "@/ports";
import { serverEnv } from "@/shared/env";
import {
  type AiAdapterDeps,
  getContainer,
  resolveAiAdapterDeps,
} from "./container";

/**
 * Factory for creating AggregatingGraphExecutor with all configured providers.
 * Per UNIFIED_GRAPH_EXECUTOR: all graph execution flows through GraphExecutorPort.
 * Per PROVIDER_AGGREGATION: AggregatingGraphExecutor routes by graphId to providers.
 * Per CATALOG_SINGLE_SOURCE_OF_TRUTH: Provider imports catalog from @cogni/langgraph-graphs.
 * Per MUTUAL_EXCLUSION: Register exactly one langgraph provider (InProc XOR Dev) based on env.
 *
 * Architecture boundary: Facade calls this factory (app → bootstrap),
 * factory creates aggregator (bootstrap → adapters). Facade never imports adapters.
 *
 * @param completionStreamFn - Feature function for LLM streaming (from features/ai)
 * @returns GraphExecutorPort implementation (AggregatingGraphExecutor)
 */
export function createGraphExecutor(
  completionStreamFn: CompletionStreamFn,
  userId: UserId
): GraphExecutorPort {
  const deps = resolveAiAdapterDeps(userId);
  const container = getContainer();

  // Per MUTUAL_EXCLUSION: choose provider based on LANGGRAPH_DEV_URL env
  const devUrl = serverEnv().LANGGRAPH_DEV_URL;
  const langGraphProvider = devUrl
    ? createDevProvider(devUrl)
    : createInProcProvider(deps, completionStreamFn);

  // Create aggregating executor with single langgraph provider
  const aggregator = new AggregatingGraphExecutor([langGraphProvider]);

  // Wrap with observability decorator for Langfuse traces
  // Per OBSERVABILITY.md#langfuse-integration: creates trace with I/O, handles terminal states
  const decorated = new ObservabilityGraphExecutorDecorator(
    aggregator,
    container.langfuse,
    { finalizationTimeoutMs: 15_000 },
    container.log
  );

  return decorated;
}

/**
 * Create InProc provider for in-process graph execution.
 * Per CAPABILITY_INJECTION: toolSource contains real implementations with I/O.
 */
function createInProcProvider(
  deps: AiAdapterDeps,
  completionStreamFn: CompletionStreamFn
): LangGraphInProcProvider {
  const container = getContainer();
  const inprocAdapter = new InProcCompletionUnitAdapter(
    deps,
    completionStreamFn
  );
  return new LangGraphInProcProvider(inprocAdapter, container.toolSource);
}

/**
 * Create Dev provider for langgraph dev server execution.
 * Per MVP_DEV_ONLY: connects to langgraph dev (port 2024).
 */
function createDevProvider(apiUrl: string): LangGraphDevProvider {
  const client = createLangGraphDevClient({ apiUrl });
  const availableGraphs = Object.keys(LANGGRAPH_CATALOG);
  return new LangGraphDevProvider(client, { availableGraphs });
}
