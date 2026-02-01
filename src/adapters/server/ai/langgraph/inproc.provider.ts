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
 *   - TOOL_CATALOG_IS_CANONICAL: Resolves BoundTool from TOOL_CATALOG using entry.toolIds
 *   - DENY_BY_DEFAULT: Tool policy explicitly provided per graph
 * Side-effects: IO (executes graphs via package runner)
 * Notes: Discovery is in LangGraphInProcAgentCatalogProvider, not here.
 * Links: GRAPH_EXECUTION.md, LANGGRAPH_AI.md
 * @internal
 */

import type { AiEvent, BoundToolRuntime } from "@cogni/ai-core";
import {
  createStaticToolSourceFromRecord,
  createToolAllowlistPolicy,
  createToolRunner,
} from "@cogni/ai-core";
import {
  type CatalogBoundTool,
  TOOL_CATALOG,
  toBoundToolRuntime,
} from "@cogni/ai-tools";
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
import { makeLogger } from "@/shared/observability";

import type { GraphProvider } from "../graph-provider";
import type { CompletionUnitParams } from "../inproc-completion-unit.adapter";

import type { LangGraphCatalog } from "./catalog";

/**
 * Provider ID for LangGraph in-process execution.
 */
export const LANGGRAPH_PROVIDER_ID = "langgraph" as const;

/**
 * Adapter interface for executing completion units.
 * Matches InProcCompletionUnitAdapter.executeCompletionUnit signature.
 */
export interface CompletionUnitAdapter {
  executeCompletionUnit(params: CompletionUnitParams): {
    stream: AsyncIterable<AiEvent>;
    final: Promise<CompletionFinalResult>;
  };
}

/**
 * Catalog entry shape (matches LangGraphCatalogEntry<CreateGraphFn>).
 * Per TOOL_CATALOG_IS_CANONICAL: tools referenced by ID, resolved from TOOL_CATALOG.
 */
interface ProviderCatalogEntry {
  readonly displayName: string;
  readonly description: string;
  readonly toolIds: readonly string[];
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
 *
 * Note: Discovery (listAgents) is in LangGraphInProcAgentCatalogProvider.
 */
export class LangGraphInProcProvider implements GraphProvider {
  readonly providerId = LANGGRAPH_PROVIDER_ID;
  private readonly log: Logger;
  private readonly catalog: LangGraphCatalog<CreateGraphFn>;

  constructor(private readonly adapter: CompletionUnitAdapter) {
    this.log = makeLogger({ component: "LangGraphInProcProvider" });

    // Use catalog from package (single source of truth)
    this.catalog = LANGGRAPH_CATALOG as LangGraphCatalog<CreateGraphFn>;

    this.log.debug(
      {
        graphCount: Object.keys(this.catalog).length,
        graphs: Object.keys(this.catalog),
      },
      "LangGraphInProcProvider initialized"
    );
  }

  canHandle(graphId: string): boolean {
    if (!graphId.startsWith(`${this.providerId}:`)) {
      return false;
    }
    const graphName = graphId.slice(this.providerId.length + 1);
    return graphName in this.catalog;
  }

  runGraph(req: GraphRunRequest): GraphRunResult {
    const {
      runId,
      ingressRequestId,
      messages,
      model,
      caller,
      abortSignal,
      graphId,
    } = req;

    // Extract graph name from graphId (e.g., "langgraph:poet" → "poet")
    const graphName = this.extractGraphName(graphId);
    if (!graphName) {
      this.log.error({ runId, graphId }, "Invalid graphId format");
      // Client error: malformed graphId
      return this.createErrorResult(runId, ingressRequestId, "invalid_request");
    }

    const entry = this.catalog[graphName] as ProviderCatalogEntry | undefined;
    if (!entry) {
      this.log.error({ runId, graphName }, "Graph not found in catalog");
      // Client error: graph doesn't exist
      return this.createErrorResult(runId, ingressRequestId, "not_found");
    }

    this.log.debug(
      { runId, graphName, model, messageCount: messages.length },
      "LangGraphInProcProvider.runGraph routing to package runner"
    );

    // Create completion function wrapping adapter
    const completionFn = this.createCompletionFn(req);

    // P0 Contract: undefined => catalog default, [] => deny-all, [...] => exact
    const catalogToolIds = entry.toolIds;
    const toolIds: readonly string[] = req.toolIds ?? catalogToolIds;
    if (req.toolIds === undefined) {
      this.log.debug(
        { runId, graphName, catalogToolIds },
        "toolIds undefined; using catalog default per P0 contract"
      );
    }

    // Resolve boundTools from TOOL_CATALOG (per TOOL_CATALOG_IS_CANONICAL)
    // Convert to BoundToolRuntime for toolRunner (per TOOL_SOURCE_RETURNS_BOUND_TOOL)
    const runtimeTools: Record<string, BoundToolRuntime> = {};
    const catalogTools: CatalogBoundTool[] = [];
    for (const toolId of catalogToolIds) {
      const tool = TOOL_CATALOG[toolId];
      if (tool) {
        runtimeTools[toolId] = toBoundToolRuntime(tool);
        catalogTools.push(tool);
      } else {
        this.log.error(
          { runId, graphName, toolId },
          "Tool not found in TOOL_CATALOG; graph misconfigured"
        );
      }
    }

    // Create tool execution function factory
    // Uses same toolIds for ToolRunner policy as configurable
    const createToolExecFn = (emit: (e: AiEvent) => void): ToolExecFn => {
      const policy = createToolAllowlistPolicy(toolIds);
      const source = createStaticToolSourceFromRecord(runtimeTools);
      const toolRunner = createToolRunner(source, emit, {
        policy,
        ctx: { runId },
      });

      return async (name, args, toolCallId) => {
        const result =
          toolCallId !== undefined
            ? await toolRunner.exec(name, args, { modelToolCallId: toolCallId })
            : await toolRunner.exec(name, args);
        return result;
      };
    };

    // Extract tool contracts from resolved catalog tools
    const toolContracts = catalogTools.map((bt) => bt.contract);

    // Build request for package runner
    // Use conditional spreads for exactOptionalPropertyTypes
    // Per UNIFIED_INVOKE_SIGNATURE: configurable has model + toolIds
    const runnerRequest: InProcGraphRequest = {
      runId,
      messages: messages as InProcGraphRequest["messages"],
      ...(abortSignal !== undefined && { abortSignal }),
      ...(caller.traceId !== undefined && { traceId: caller.traceId }),
      ...(ingressRequestId !== undefined && { ingressRequestId }),
      configurable: { model, toolIds },
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
  private extractGraphName(graphId: string): string | undefined {
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
            content: r.content ?? "",
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

    // Conditional spreads for exactOptionalPropertyTypes
    return {
      ok: true,
      runId,
      requestId,
      finishReason: "stop",
      ...(result.usage !== undefined && { usage: result.usage }),
      ...(result.content !== undefined && { content: result.content }),
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
