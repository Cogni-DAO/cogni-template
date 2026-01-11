// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/ai/langgraph/inproc.provider`
 * Purpose: LangGraph in-process graph provider for Next.js runtime.
 * Scope: Routes graph execution to package runner. Does NOT import @langchain/* directly — all LangChain in package.
 * Invariants:
 *   - NO_LANGCHAIN_IN_SRC: No @langchain imports; delegates to package runner
 *   - GRAPH_ID_NAMESPACED: graphId format is "langgraph:${graphName}"
 *   - CATALOG_SINGLE_SOURCE_OF_TRUTH: Uses catalog from @cogni/langgraph-graphs
 *   - DENY_BY_DEFAULT: Tool policy explicitly provided per graph
 * Side-effects: IO (executes graphs via package runner)
 * Links: GRAPH_EXECUTION.md, LANGGRAPH_AI.md
 * @internal
 */

import type { AiEvent } from "@cogni/ai-core";
import {
  type CompletionFn,
  type CreateGraphFn,
  createInProcGraphRunner,
  type GraphResult,
  type InProcGraphRequest,
  LANGGRAPH_CATALOG,
  type ToolExecFn,
} from "@cogni/langgraph-graphs";
import type { Logger } from "pino";

import type {
  AiExecutionErrorCode,
  CompletionFinalResult,
  GraphFinal,
  GraphRunRequest,
  GraphRunResult,
  LlmToolDefinition,
  Message,
} from "@/ports";
import { createToolAllowlistPolicy } from "@/shared/ai/tool-policy";
import { createToolRunner } from "@/shared/ai/tool-runner";
import { makeLogger } from "@/shared/observability";

import type {
  GraphCapabilities,
  GraphDescriptor,
  GraphProvider,
} from "../graph-provider";
import type { CompletionUnitParams } from "../inproc-graph.adapter";

import type { AnyBoundTool, LangGraphCatalog } from "./catalog";

/**
 * Provider ID for LangGraph in-process execution.
 */
export const LANGGRAPH_PROVIDER_ID = "langgraph" as const;

/**
 * Adapter interface for executing completion units.
 * Matches InProcGraphExecutorAdapter.executeCompletionUnit signature.
 */
export interface CompletionUnitAdapter {
  executeCompletionUnit(params: CompletionUnitParams): {
    stream: AsyncIterable<AiEvent>;
    final: Promise<CompletionFinalResult>;
  };
}

/**
 * Catalog entry with bound tools for this provider.
 * Extends package catalog with bound tools from @cogni/ai-tools.
 */
interface ProviderCatalogEntry {
  readonly displayName: string;
  readonly description: string;
  readonly boundTools: Readonly<Record<string, AnyBoundTool>>;
  readonly graphFactory: CreateGraphFn;
}

/**
 * LangGraph in-process provider.
 *
 * Routes graph execution to package runner (createInProcGraphRunner).
 * All LangChain logic is in the package — this provider is LangChain-free.
 *
 * Per GRAPH_LLM_VIA_COMPLETION: all LLM calls go through adapter.executeCompletionUnit
 * for billing/telemetry centralization.
 */
export class LangGraphInProcProvider implements GraphProvider {
  readonly providerId = LANGGRAPH_PROVIDER_ID;
  private readonly log: Logger;
  private readonly graphDescriptors: readonly GraphDescriptor[];
  private readonly catalog: LangGraphCatalog<CreateGraphFn>;

  constructor(private readonly adapter: CompletionUnitAdapter) {
    this.log = makeLogger({ component: "LangGraphInProcProvider" });

    // Use catalog from package (single source of truth)
    this.catalog = LANGGRAPH_CATALOG as LangGraphCatalog<CreateGraphFn>;

    // Build descriptors from catalog entries
    this.graphDescriptors = this.buildDescriptors();

    this.log.debug(
      {
        graphCount: this.graphDescriptors.length,
        graphs: Object.keys(this.catalog),
      },
      "LangGraphInProcProvider initialized"
    );
  }

  /**
   * Build graph descriptors from catalog entries.
   */
  private buildDescriptors(): readonly GraphDescriptor[] {
    return Object.entries(this.catalog).map(([graphName, entry]) => ({
      graphId: `${this.providerId}:${graphName}`,
      displayName: entry.displayName,
      description: entry.description,
      capabilities: this.inferCapabilities(),
    }));
  }

  /**
   * Infer capabilities for InProc graphs.
   * All LangGraph InProc graphs have same capabilities in P0.
   */
  private inferCapabilities(): GraphCapabilities {
    return {
      supportsStreaming: true,
      supportsTools: true,
      supportsMemory: false, // P0: no thread persistence
    };
  }

  listGraphs(): readonly GraphDescriptor[] {
    return this.graphDescriptors;
  }

  canHandle(graphId: string): boolean {
    if (!graphId.startsWith(`${this.providerId}:`)) {
      return false;
    }
    const graphName = graphId.slice(this.providerId.length + 1);
    return graphName in this.catalog;
  }

  runGraph(req: GraphRunRequest): GraphRunResult {
    const { runId, ingressRequestId, messages, model, caller, abortSignal } =
      req;
    const graphId = req.graphName;

    // Extract graph name from graphId (e.g., "langgraph:poet" → "poet")
    const graphName = this.extractGraphName(graphId);
    if (!graphName) {
      this.log.error({ runId, graphId }, "Invalid graphId format");
      return this.createErrorResult(runId, ingressRequestId);
    }

    const entry = this.catalog[graphName] as ProviderCatalogEntry | undefined;
    if (!entry) {
      this.log.error({ runId, graphName }, "Graph not found in catalog");
      return this.createErrorResult(runId, ingressRequestId);
    }

    this.log.debug(
      { runId, graphName, model, messageCount: messages.length },
      "LangGraphInProcProvider.runGraph routing to package runner"
    );

    // Create completion function wrapping adapter
    const completionFn = this.createCompletionFn(req);

    // Create tool execution function factory
    const createToolExecFn = (emit: (e: AiEvent) => void): ToolExecFn => {
      const toolNames = Object.keys(entry.boundTools);
      const policy = createToolAllowlistPolicy(toolNames);
      const toolRunner = createToolRunner(entry.boundTools, emit, {
        policy,
        ctx: { runId },
      });

      return async (
        name: string,
        args: unknown,
        toolCallId?: string
      ): Promise<{ ok: boolean; value?: unknown; errorCode?: string }> => {
        const result =
          toolCallId !== undefined
            ? await toolRunner.exec(name, args, { modelToolCallId: toolCallId })
            : await toolRunner.exec(name, args);
        return result;
      };
    };

    // Extract tool contracts
    const toolContracts = Object.values(entry.boundTools).map(
      (bt) => bt.contract
    );

    // Build request for package runner
    // Use conditional spreads for exactOptionalPropertyTypes
    const runnerRequest: InProcGraphRequest = {
      runId,
      messages: messages as InProcGraphRequest["messages"],
      model,
      ...(abortSignal !== undefined && { abortSignal }),
      ...(caller.traceId !== undefined && { traceId: caller.traceId }),
      ...(ingressRequestId !== undefined && { ingressRequestId }),
    };

    // Delegate to package runner — all LangChain logic is there
    const { stream, final } = createInProcGraphRunner({
      createGraph: entry.graphFactory,
      completionFn,
      createToolExecFn,
      toolContracts,
      request: runnerRequest,
    });

    // Map package result to GraphFinal
    const mappedFinal = this.mapToGraphFinal(final, runId, ingressRequestId);

    return { stream, final: mappedFinal };
  }

  /**
   * Extract graph name from namespaced graphId.
   * Per GRAPH_ID_NAMESPACED: "langgraph:poet" → "poet"
   */
  private extractGraphName(graphId: string | undefined): string | undefined {
    if (!graphId) return undefined;

    const prefix = `${this.providerId}:`;
    if (graphId.startsWith(prefix)) {
      return graphId.slice(prefix.length);
    }

    return undefined;
  }

  /**
   * Create completion function wrapping adapter.executeCompletionUnit.
   */
  private createCompletionFn(
    req: GraphRunRequest
  ): CompletionFn<LlmToolDefinition> {
    const { caller, runId, ingressRequestId } = req;
    const attempt = 0; // P0_ATTEMPT_FREEZE

    return (params: {
      messages: Message[];
      model: string;
      tools?: readonly LlmToolDefinition[];
      abortSignal?: AbortSignal;
    }) => {
      const result = this.adapter.executeCompletionUnit({
        messages: params.messages as GraphRunRequest["messages"],
        model: params.model,
        caller,
        runContext: { runId, attempt, ingressRequestId },
        ...(params.abortSignal && { abortSignal: params.abortSignal }),
        ...(params.tools?.length && { tools: [...params.tools] }),
      });

      return {
        stream: result.stream,
        final: result.final.then((r) => {
          if (!r.ok) return { ok: false as const, error: r.error };
          return {
            ok: true as const,
            content: "",
            ...(r.toolCalls && { toolCalls: r.toolCalls }),
            ...(r.usage && { usage: r.usage }),
            ...(r.finishReason && { finishReason: r.finishReason }),
          };
        }),
      };
    };
  }

  /**
   * Map package GraphResult to port GraphFinal.
   * GraphResult.error is now AiExecutionErrorCode - direct passthrough.
   */
  private async mapToGraphFinal(
    final: Promise<GraphResult>,
    runId: string,
    requestId: string
  ): Promise<GraphFinal> {
    const result = await final;

    if (!result.ok) {
      // Direct passthrough - GraphResult.error is already AiExecutionErrorCode
      return { ok: false, runId, requestId, error: result.error ?? "internal" };
    }

    // Use explicit conditional for exactOptionalPropertyTypes
    if (result.usage !== undefined) {
      return {
        ok: true,
        runId,
        requestId,
        finishReason: "stop",
        usage: result.usage,
      };
    }

    return {
      ok: true,
      runId,
      requestId,
      finishReason: "stop",
    };
  }

  /**
   * Create error result for invalid requests.
   * Per ERROR_NORMALIZATION: details logged, stream gets code only.
   */
  private createErrorResult(
    runId: string,
    requestId: string,
    code: AiExecutionErrorCode = "internal"
  ): GraphRunResult {
    const errorStream = (async function* () {
      yield { type: "error" as const, error: code };
      yield { type: "done" as const };
    })();

    return {
      stream: errorStream,
      final: Promise.resolve({
        ok: false as const,
        runId,
        requestId,
        error: code,
      }),
    };
  }
}
