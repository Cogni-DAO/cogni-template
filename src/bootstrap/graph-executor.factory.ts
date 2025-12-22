// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@bootstrap/graph-executor.factory`
 * Purpose: Factory for creating GraphExecutorPort implementations.
 * Scope: Bridges app layer (facades) to adapters layer via bootstrap. Does not contain business logic.
 * Invariants:
 *   - Facade NEVER imports adapters directly (use this factory)
 *   - Per UNIFIED_GRAPH_EXECUTOR: all graph execution flows through GraphExecutorPort
 * Side-effects: none
 * Links: container.ts, InProcGraphExecutorAdapter, GRAPH_EXECUTION.md
 * @public
 */

import {
  type CompletionStreamFn,
  type GraphResolverFn,
  InProcGraphExecutorAdapter,
} from "@/adapters/server";
import type { GraphExecutorPort } from "@/ports";
import { resolveAiAdapterDeps } from "./container";

/**
 * Factory for creating InProcGraphExecutorAdapter with optional graph resolver.
 * Per UNIFIED_GRAPH_EXECUTOR: all graph execution flows through GraphExecutorPort.
 *
 * Architecture boundary: Facade calls this factory (app → bootstrap),
 * factory creates adapter (bootstrap → adapters). Facade never imports adapters.
 * Resolver is built by facade (app layer can import features), passed here.
 *
 * @param completionStreamFn - Feature function for LLM streaming (from features/ai)
 * @param graphResolver - Optional resolver for graph routing (from facade)
 * @returns GraphExecutorPort implementation
 */
export function createInProcGraphExecutor(
  completionStreamFn: CompletionStreamFn,
  graphResolver?: GraphResolverFn
): GraphExecutorPort {
  const deps = resolveAiAdapterDeps();
  return new InProcGraphExecutorAdapter(
    deps,
    completionStreamFn,
    graphResolver
  );
}
