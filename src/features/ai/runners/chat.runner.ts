// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/ai/runners/chat.runner`
 * Purpose: Thin wrapper that creates chat graph runner for bootstrap wiring.
 * Scope: Creates ChatGraphDeps, invokes executeChatGraph, returns GraphRunResult. Does not contain orchestration logic.
 * Invariants:
 *   - MVP_NOOP_EMIT: toolRunner receives noop emit (graph yields events directly)
 *   - TOOLS_FROM_REGISTRY: tools loaded via getToolsForGraph()
 *   - GRAPH_LLM_VIA_COMPLETION: completionUnit provided by adapter
 * Side-effects: none (pure factory)
 * Notes: MVP implementation before LangGraph migration
 * Links: chat.graph.ts, tool-registry.ts, bootstrap/graph-executor.factory.ts
 * @internal
 */

import type { GraphRunRequest, GraphRunResult } from "@/ports";

import {
  type ChatGraphDeps,
  type CompletionUnitFn,
  executeChatGraph,
} from "../graphs/chat.graph";
import { getToolsForGraph } from "../tool-registry";
import { createToolRunner } from "../tool-runner";

/**
 * Adapter interface for executing a single completion unit.
 * Matches InProcGraphExecutorAdapter.executeCompletionUnit signature.
 */
export interface CompletionUnitAdapter {
  executeCompletionUnit(params: {
    messages: GraphRunRequest["messages"];
    model: string;
    caller: GraphRunRequest["caller"];
    runContext: {
      runId: string;
      attempt: number;
      ingressRequestId: string;
    };
    abortSignal?: AbortSignal;
    tools?: import("@/ports").LlmToolDefinition[];
    toolChoice?: import("@/ports").LlmToolChoice;
  }): {
    stream: AsyncIterable<import("../types").AiEvent>;
    final: Promise<import("../graphs/chat.graph").CompletionUnitFinalResult>;
  };
}

/**
 * GraphRunnerFn type - matches adapter's expected signature.
 */
export type GraphRunnerFn = (req: GraphRunRequest) => GraphRunResult;

/**
 * Create a chat graph runner.
 * Returns a GraphRunnerFn that can be used by the adapter's graphResolver.
 *
 * @param adapter - Adapter with executeCompletionUnit method
 * @returns GraphRunnerFn for "chat" graph
 */
export function createChatRunner(
  adapter: CompletionUnitAdapter
): GraphRunnerFn {
  return (req: GraphRunRequest): GraphRunResult => {
    const { runId, ingressRequestId, messages, model, caller, abortSignal } =
      req;
    const attempt = 0; // P0_ATTEMPT_FREEZE

    // Get tools for chat graph
    const { llmDefinitions, boundTools } = getToolsForGraph("chat_graph");

    // Create toolRunner with noop emit (MVP: graph yields events directly)
    const noopEmit = () => {};
    const toolRunner = createToolRunner(boundTools, noopEmit);

    // Create completionUnit bound to this run's context
    const completionUnit: CompletionUnitFn = (params) => {
      return adapter.executeCompletionUnit({
        messages: params.messages,
        model: params.model,
        caller,
        runContext: { runId, attempt, ingressRequestId },
        ...(params.abortSignal ? { abortSignal: params.abortSignal } : {}),
        ...(params.tools ? { tools: params.tools } : {}),
      });
    };

    // Build deps
    const deps: ChatGraphDeps = {
      completionUnit,
      toolRunner,
      tools: llmDefinitions,
    };

    // Execute graph - returns async generator
    const generator = executeChatGraph(messages, model, abortSignal, deps);

    // Convert generator to { stream, final }
    // The generator yields AiEvent and returns ChatGraphResult
    const streamAndFinal = convertGeneratorToResult(generator, runId);

    return streamAndFinal;
  };
}

/**
 * Convert AsyncGenerator<AiEvent, ChatGraphResult> to GraphRunResult.
 * Wraps generator as stream, extracts return value as final.
 */
function convertGeneratorToResult(
  generator: AsyncGenerator<
    import("../types").AiEvent,
    import("../graphs/chat.graph").ChatGraphResult
  >,
  runId: string
): GraphRunResult {
  // Shared state for final result
  let resolveResult: ((value: import("@/ports").GraphFinal) => void) | null =
    null;
  let rejectResult: ((error: unknown) => void) | null = null;
  const finalPromise = new Promise<import("@/ports").GraphFinal>(
    (resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    }
  );

  // Create async iterable that consumes generator
  async function* streamWrapper(): AsyncIterable<import("../types").AiEvent> {
    try {
      let iterResult = await generator.next();

      while (!iterResult.done) {
        yield iterResult.value;
        iterResult = await generator.next();
      }

      // Generator returned - extract final result
      const graphResult = iterResult.value;
      resolveResult?.({
        ok: true,
        runId,
        requestId: graphResult.requestId,
        usage: graphResult.usage,
        finishReason: graphResult.finishReason,
      });
    } catch (error) {
      rejectResult?.(error);
      throw error;
    }
  }

  return {
    stream: streamWrapper(),
    final: finalPromise,
  };
}
