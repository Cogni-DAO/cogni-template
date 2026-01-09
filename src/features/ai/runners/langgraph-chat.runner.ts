// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/ai/runners/langgraph-chat.runner`
 * Purpose: Adapter wiring createInProcChatRunner from @cogni/langgraph-graphs to existing infrastructure.
 * Scope: Wraps executeCompletionUnit as CompletionFn, wires toolRunner, returns GraphRunResult; does not contain graph orchestration logic.
 * Invariants:
 *   - GRAPH_LLM_VIA_COMPLETION: completionUnit provided by adapter
 *   - TOOLS_FROM_PACKAGES: tools imported from @cogni/ai-tools
 *   - TOOLCALL_ID_STABLE: toolCallId passed through to toolRunner
 * Side-effects: none (pure factory)
 * Links: @cogni/langgraph-graphs/inproc, chat.runner.ts, LANGGRAPH_AI.md
 * @internal
 */

import type { ToolContract } from "@cogni/ai-tools";
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

import type {
  CompletionFinalResult,
  GraphFinal,
  GraphRunRequest,
  GraphRunResult,
  LlmToolDefinition,
} from "@/ports";
import { createToolAllowlistPolicy } from "@/shared/ai/tool-policy";
import { createToolRunner } from "@/shared/ai/tool-runner";

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
 * Policy for chat graph tools.
 * Per DENY_BY_DEFAULT: only explicitly allowed tools can execute.
 *
 * TODO(P1): Load from graph config or policy store instead of hardcoding.
 * This violates POLICY_IS_DATA but is acceptable for P0 bootstrap.
 * See TOOL_USE_SPEC.md P1 checklist: "Tenant/role-based ToolPolicy via config"
 */
const CHAT_GRAPH_POLICY = createToolAllowlistPolicy([GET_CURRENT_TIME_NAME]);

/**
 * Adapter interface for executing a single completion unit.
 * Matches InProcGraphExecutorAdapter.executeCompletionUnit signature.
 * Uses CompletionFinalResult from ports (canonical discriminated union).
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
    tools?: LlmToolDefinition[];
    toolChoice?: import("@/ports").LlmToolChoice;
  }): {
    stream: AsyncIterable<AiEvent>;
    final: Promise<CompletionFinalResult>;
  };
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
    // Generic specifies LlmToolDefinition so params.tools is properly typed
    const completionFn: CompletionFn<LlmToolDefinition> = (params) => {
      const result = adapter.executeCompletionUnit({
        messages: params.messages as GraphRunRequest["messages"],
        model: params.model,
        caller,
        runContext: { runId, attempt, ingressRequestId },
        // Conditional spreads for exactOptionalPropertyTypes
        ...(params.abortSignal !== undefined && {
          abortSignal: params.abortSignal,
        }),
        // Forward tools to LLM (bound via CompletionUnitLLM.bindTools)
        // tools is now readonly LlmToolDefinition[] via generic
        ...(params.tools &&
          params.tools.length > 0 && { tools: [...params.tools] }),
      });

      return {
        stream: result.stream,
        final: mapToCompletionResult(result.final),
      };
    };

    // Factory that creates toolExecFn with emit callback bound
    // Per TOOLCALLID_STABLE: toolRunner generates ID if not provided by wrapper
    // Per DENY_BY_DEFAULT: policy must be explicitly provided
    const createToolExecFn = (emit: (e: AiEvent) => void) => {
      const toolRunner = createToolRunner(CHAT_GRAPH_BOUND_TOOLS, emit, {
        policy: CHAT_GRAPH_POLICY,
        ctx: { runId },
      });
      return async (name: string, args: unknown, toolCallId?: string) => {
        // P0: toolCallId is undefined (toolRunner generates)
        // P1: pass providerToolCallId from AIMessage.tool_calls
        // Conditional spread for exactOptionalPropertyTypes
        if (toolCallId !== undefined) {
          return toolRunner.exec(name, args, { modelToolCallId: toolCallId });
        }
        return toolRunner.exec(name, args);
      };
    };

    // Build request for package runner
    // Conditional spreads for exactOptionalPropertyTypes
    const inprocRequest: InProcGraphRequest = {
      runId,
      messages: messages as Message[],
      model,
      ...(abortSignal !== undefined && { abortSignal }),
      ...(caller.traceId !== undefined && { traceId: caller.traceId }),
      ...(ingressRequestId !== undefined && { ingressRequestId }),
    };

    // Execute via package runner
    const { stream, final } = createInProcChatRunner({
      completionFn,
      createToolExecFn,
      // Cast: concrete ToolContract types satisfy generic constraint
      toolContracts: CHAT_GRAPH_TOOL_CONTRACTS as ReadonlyArray<
        ToolContract<string, unknown, unknown, unknown>
      >,
      request: inprocRequest,
    });

    // Map package's final to port's GraphFinal
    const mappedFinal = mapToGraphFinal(final, runId, ingressRequestId);

    return { stream, final: mappedFinal };
  };
}

/**
 * Map CompletionFinalResult to CompletionResult (package format).
 * Handles discriminated union with proper narrowing.
 */
async function mapToCompletionResult(
  final: Promise<CompletionFinalResult>
): Promise<CompletionResult> {
  const result = await final;

  // Handle error case
  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
    };
  }

  // Success case - map with conditional spreads for exactOptionalPropertyTypes
  return {
    ok: true,
    content: "", // Content comes from stream, not final for tool-calling flows
    ...(result.toolCalls !== undefined && { toolCalls: result.toolCalls }),
    ...(result.usage !== undefined && { usage: result.usage }),
    ...(result.finishReason !== undefined && {
      finishReason: result.finishReason,
    }),
  };
}

/**
 * Map package's GraphResult to port's GraphFinal.
 * Handles exactOptionalPropertyTypes with conditional spreads.
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
      // Conditional spreads for exactOptionalPropertyTypes
      ...(result.usage !== undefined && { usage: result.usage }),
      ...(result.finishReason !== undefined && {
        finishReason: result.finishReason,
      }),
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
