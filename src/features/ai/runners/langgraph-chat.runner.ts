// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/ai/runners/langgraph-chat.runner`
 * Purpose: Adapter wiring createInProcChatRunner from @cogni/langgraph-graphs to existing infrastructure.
 * Scope: Wraps executeCompletionUnit as CompletionFn, wires toolRunner, returns GraphRunResult.
 * Invariants:
 *   - GRAPH_LLM_VIA_COMPLETION: completionUnit provided by adapter
 *   - TOOLS_FROM_PACKAGES: tools imported from @cogni/ai-tools
 *   - TOOLCALL_ID_STABLE: toolCallId passed through to toolRunner
 * Side-effects: none (pure factory)
 * Links: @cogni/langgraph-graphs/inproc, chat.runner.ts, LANGGRAPH_AI.md
 * @internal
 */

import {
  type BoundTool,
  GET_CURRENT_TIME_NAME,
  getCurrentTimeBoundTool,
  getCurrentTimeContract,
} from "@cogni/ai-tools";
import {
  type CompletionFn,
  type CompletionResult,
  createInProcChatRunner,
  type GraphResult,
  type InProcGraphRequest,
  type Message,
} from "@cogni/langgraph-graphs/inproc";

import type { GraphFinal, GraphRunRequest, GraphRunResult } from "@/ports";

import { createToolRunner } from "../tool-runner";
import type { AiEvent } from "../types";

type AnyBoundTool = BoundTool<
  string,
  unknown,
  unknown,
  Record<string, unknown>
>;

/** Chat graph tools - bound from @cogni/ai-tools */
const CHAT_GRAPH_BOUND_TOOLS: Record<string, AnyBoundTool> = {
  [GET_CURRENT_TIME_NAME]: getCurrentTimeBoundTool as AnyBoundTool,
};

/** Tool contracts for LangGraph wrapping */
const CHAT_GRAPH_TOOL_CONTRACTS = [getCurrentTimeContract];

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
    stream: AsyncIterable<AiEvent>;
    final: Promise<CompletionUnitFinalResult>;
  };
}

interface CompletionUnitFinalResult {
  ok: true;
  requestId: string;
  usage: { promptTokens: number; completionTokens: number };
  finishReason: string;
  model?: string;
  providerCostUsd?: number;
  litellmCallId?: string;
  toolCalls?: Array<{ id: string; name: string; arguments: string }>;
}

/** GraphRunnerFn type - matches adapter's expected signature. */
export type GraphRunnerFn = (req: GraphRunRequest) => GraphRunResult;

/**
 * Create a LangGraph-based chat runner.
 * Uses createInProcChatRunner from @cogni/langgraph-graphs/inproc.
 *
 * @param adapter - Adapter with executeCompletionUnit method
 * @returns GraphRunnerFn for "chat" graph
 */
export function createLangGraphChatRunner(
  adapter: CompletionUnitAdapter
): GraphRunnerFn {
  return (req: GraphRunRequest): GraphRunResult => {
    const { runId, ingressRequestId, messages, model, caller, abortSignal } =
      req;
    const attempt = 0; // P0_ATTEMPT_FREEZE

    // Wrap adapter.executeCompletionUnit as CompletionFn
    // Per TOOLS_VIA_BINDTOOLS: forward tools from LangGraph to LLM
    const completionFn: CompletionFn = (params) => {
      const result = adapter.executeCompletionUnit({
        messages: params.messages as GraphRunRequest["messages"],
        model: params.model,
        caller,
        runContext: { runId, attempt, ingressRequestId },
        abortSignal: params.abortSignal,
        // Forward tools to LLM (bound via CompletionUnitLLM.bindTools)
        ...(params.tools && params.tools.length > 0 && { tools: params.tools }),
      });

      return {
        stream: result.stream,
        final: mapToCompletionResult(result.final),
      };
    };

    // Factory that creates toolExecFn with emit callback bound
    // Per TOOLCALLID_STABLE: toolRunner generates ID if not provided by wrapper
    const createToolExecFn = (emit: (e: AiEvent) => void) => {
      const toolRunner = createToolRunner(CHAT_GRAPH_BOUND_TOOLS, emit);
      return async (name: string, args: unknown, toolCallId?: string) => {
        // P0: toolCallId is undefined (toolRunner generates)
        // P1: pass providerToolCallId from AIMessage.tool_calls
        return toolRunner.exec(name, args, { modelToolCallId: toolCallId });
      };
    };

    // Build request for package runner
    const inprocRequest: InProcGraphRequest = {
      runId,
      messages: messages as Message[],
      model,
      abortSignal,
      traceId: caller.traceId,
      ingressRequestId,
    };

    // Execute via package runner
    const { stream, final } = createInProcChatRunner({
      completionFn,
      createToolExecFn,
      toolContracts: CHAT_GRAPH_TOOL_CONTRACTS,
      request: inprocRequest,
    });

    // Map package's final to port's GraphFinal
    const mappedFinal = mapToGraphFinal(final, runId, ingressRequestId);

    return { stream, final: mappedFinal };
  };
}

/**
 * Map CompletionUnitFinalResult to CompletionResult (package format).
 */
async function mapToCompletionResult(
  final: Promise<CompletionUnitFinalResult>
): Promise<CompletionResult> {
  const result = await final;
  return {
    ok: result.ok,
    content: "", // Content comes from stream, not final for tool-calling flows
    toolCalls: result.toolCalls,
    usage: result.usage,
    finishReason: result.finishReason,
  };
}

/**
 * Map package's GraphResult to port's GraphFinal.
 */
async function mapToGraphFinal(
  final: Promise<GraphResult>,
  runId: string,
  requestId: string
): Promise<GraphFinal> {
  const result = await final;
  if (result.ok) {
    return {
      ok: true,
      runId,
      requestId,
      usage: result.usage,
      finishReason: result.finishReason,
    };
  }
  // Map to stable error codes per GraphFinal type
  const error: "timeout" | "aborted" | "internal" =
    result.error === "aborted"
      ? "aborted"
      : result.error?.includes("timeout")
        ? "timeout"
        : "internal";
  return {
    ok: false,
    runId,
    requestId,
    error,
  };
}
