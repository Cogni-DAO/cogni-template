// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/ai/graphs/chat.graph`
 * Purpose: Chat graph with agentic tool loop (LLM → tool → LLM cycle).
 * Scope: Orchestrates multi-step chat with tool use. Does not import adapters.
 * Invariants:
 *   - GRAPHS_NO_IO: No IO/adapter imports; all effects via injected deps
 *   - GRAPHS_USE_TOOLRUNNER_ONLY: Tools invoked exclusively via toolRunner.exec()
 *   - GRAPH_LLM_VIA_COMPLETION: Uses injected completion unit, not llmService
 *   - ADAPTER_ASSEMBLES_TOOLCALLS: Reads from final.toolCalls, not raw deltas
 *   - ADAPTER_EMITS_USAGE_REPORT: Adapter handles usage_report, not graph
 *   - GRAPH_FINALIZATION_ONCE: Exactly one done event per execution
 *   - MVP_GRAPH_YIELDS_TOOL_EVENTS: Graph yields tool_call_start/result directly (noop emit to toolRunner)
 * Side-effects: none (pure logic; effects via injected deps)
 * Notes: Hand-rolled agentic loop per NO_LANGGRAPH_RUNTIME invariant. MVP: graph yields tool events directly.
 * Links: ai_runtime.ts, tool-runner.ts, TOOL_USE_SPEC.md
 * @internal
 */

import type { Message } from "@/core";
import type { LlmToolCall, LlmToolDefinition } from "@/ports";

import type { ToolRunner } from "@/shared/ai/tool-runner";
import type {
  AiEvent,
  ToolCallResultEvent,
  ToolCallStartEvent,
} from "../types";

/**
 * Graph name for telemetry.
 * Per AI_SETUP_SPEC.md: graph_name and graph_version required with graphRunId.
 */
export const CHAT_GRAPH_NAME = "chat_graph" as const;

/** Maximum tool loop iterations to prevent infinite loops */
const MAX_TOOL_STEPS = 5;

/**
 * Completion unit result shape (from adapter.executeCompletionUnit).
 * Stream includes text_delta + usage_report but NOT done.
 */
export type CompletionUnitFinalResult =
  | {
      ok: true;
      requestId: string;
      usage: { promptTokens: number; completionTokens: number };
      finishReason: string;
      toolCalls?: LlmToolCall[];
    }
  | {
      ok: false;
      requestId: string;
      error: "timeout" | "aborted" | "internal";
    };

/**
 * Completion unit function signature (injected from adapter.executeCompletionUnit).
 * Per GRAPH_LLM_VIA_COMPLETION: graph calls this, not llmService directly.
 * Per ADAPTER_EMITS_USAGE_REPORT: adapter handles usage_report in stream.
 */
export type CompletionUnitFn = (params: {
  messages: Message[];
  model: string;
  tools?: LlmToolDefinition[];
  abortSignal?: AbortSignal;
}) => {
  /** Stream of AiEvents (text_delta, usage_report) - NO done */
  stream: AsyncIterable<AiEvent>;
  /** Final result including toolCalls */
  final: Promise<CompletionUnitFinalResult>;
};

/**
 * Dependencies for chat graph.
 * Injected at execution time (no direct adapter imports).
 */
export interface ChatGraphDeps {
  /** Completion unit function (from adapter) */
  readonly completionUnit: CompletionUnitFn;
  /** Tool runner for tool execution. MVP: pass noop emit, graph yields events directly */
  readonly toolRunner: ToolRunner;
  /** LLM tool definitions to send with requests */
  readonly tools: LlmToolDefinition[];
}

/**
 * Result from chat graph execution.
 */
export interface ChatGraphResult {
  /** Aggregated usage across all LLM calls */
  readonly usage: {
    readonly promptTokens: number;
    readonly completionTokens: number;
  };
  /** Final finish reason */
  readonly finishReason: string;
  /** Request ID from last LLM call */
  readonly requestId: string;
}

/**
 * Execute the chat graph with agentic tool loop.
 *
 * Flow:
 * 1. Call completion unit with tools
 * 2. Forward ALL events from stream (text_delta + usage_report from adapter)
 * 3. If finishReason === "tool_calls", execute tools via toolRunner
 * 4. Build tool result messages, loop back to LLM
 * 5. Continue until finishReason !== "tool_calls" or maxSteps reached
 * 6. Emit exactly one done event at the end
 *
 * Note: usage_report is emitted by adapter via stream, not by graph.
 *
 * @param messages - Initial conversation messages
 * @param model - Model to use
 * @param abortSignal - Optional abort signal
 * @param deps - Injected dependencies
 * @returns Async generator of AiEvents
 */
export async function* executeChatGraph(
  messages: Message[],
  model: string,
  abortSignal: AbortSignal | undefined,
  deps: ChatGraphDeps
): AsyncGenerator<AiEvent, ChatGraphResult> {
  const { completionUnit, toolRunner, tools } = deps;

  // Track conversation state
  let currentMessages: Message[] = [...messages];
  let step = 0;

  // Aggregate usage across all LLM calls
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let lastRequestId = "";
  let lastFinishReason = "stop";

  while (step < MAX_TOOL_STEPS) {
    step++;

    // Call completion unit with tools
    const { stream, final } = completionUnit({
      messages: currentMessages,
      model,
      ...(tools.length > 0 ? { tools } : {}),
      ...(abortSignal ? { abortSignal } : {}),
    });

    // Forward ALL events from stream (text_delta + usage_report)
    // Per ADAPTER_EMITS_USAGE_REPORT: adapter handles billing events
    for await (const event of stream) {
      yield event;
    }

    // Await final result
    const result = await final;

    if (!result.ok) {
      // Emit error and exit
      yield { type: "error", error: result.error };
      return {
        usage: {
          promptTokens: totalPromptTokens,
          completionTokens: totalCompletionTokens,
        },
        finishReason: "error",
        requestId: result.requestId,
      };
    }

    // Update aggregated usage
    totalPromptTokens += result.usage.promptTokens;
    totalCompletionTokens += result.usage.completionTokens;
    lastRequestId = result.requestId;
    lastFinishReason = result.finishReason;

    // Check if LLM wants to use tools
    // Per ADAPTER_ASSEMBLES_TOOLCALLS: only use final.toolCalls, not streamed deltas
    if (result.finishReason !== "tool_calls" || !result.toolCalls?.length) {
      // No tool calls - we're done
      break;
    }

    // Execute each tool call inline (so we can yield events)
    // Per MVP_GRAPH_YIELDS_TOOL_EVENTS: graph yields start/result directly
    const toolResults: Array<{ toolCallId: string; result: unknown }> = [];

    for (const toolCall of result.toolCalls) {
      const toolCallId = toolCall.id;
      const toolName = toolCall.function.name;

      // Parse arguments JSON
      // Per TOOL_USE_SPEC invalid_args_behavior: safe error, continue loop
      let args: unknown;
      let parseError = false;
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch {
        parseError = true;
        args = {}; // Will fail validation in toolRunner
      }

      // Handle JSON parse error: yield safe error result, continue
      if (parseError) {
        const safeErrorResult = {
          error: "invalid_json",
          message: "Invalid tool arguments JSON",
        };
        const errorResultEvent: ToolCallResultEvent = {
          type: "tool_call_result",
          toolCallId,
          result: safeErrorResult,
          isError: true,
        };
        yield errorResultEvent;
        toolResults.push({ toolCallId, result: safeErrorResult });
        continue;
      }

      // Yield tool_call_start before execution
      const startEvent: ToolCallStartEvent = {
        type: "tool_call_start",
        toolCallId,
        toolName,
        args: args as Record<string, unknown>,
      };
      yield startEvent;

      // Execute tool via toolRunner (preserves validation/redaction)
      // Per GRAPHS_USE_TOOLRUNNER_ONLY: always go through toolRunner.exec()
      const execResult = await toolRunner.exec(toolName, args, {
        modelToolCallId: toolCallId,
      });

      // Yield tool_call_result after execution
      const resultPayload = execResult.ok
        ? execResult.value
        : { error: execResult.safeMessage };
      const resultEvent: ToolCallResultEvent = {
        type: "tool_call_result",
        toolCallId,
        result: resultPayload,
        ...(execResult.ok ? {} : { isError: true }),
      };
      yield resultEvent;

      // Collect result for building tool message
      toolResults.push({ toolCallId, result: resultPayload });
    }

    // Build messages for next LLM call:
    // 1. Assistant message with tool_calls
    // 2. Tool result messages
    const assistantMessage: Message = {
      role: "assistant",
      content: "", // Content may be empty when there are tool calls
      toolCalls: result.toolCalls.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      })),
    };

    const toolMessages: Message[] = toolResults.map((tr) => ({
      role: "tool" as const,
      content: JSON.stringify(tr.result),
      toolCallId: tr.toolCallId,
    }));

    // Extend conversation with tool interaction
    currentMessages = [...currentMessages, assistantMessage, ...toolMessages];
  }

  // Emit done event (exactly once per GRAPH_FINALIZATION_ONCE)
  yield { type: "done" };

  return {
    usage: {
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
    },
    finishReason: lastFinishReason,
    requestId: lastRequestId,
  };
}

// Note: Tool execution is inlined in executeChatGraph to enable direct event yielding.
// Per MVP_GRAPH_YIELDS_TOOL_EVENTS: graph yields tool_call_start/result directly,
// bypassing the emit callback mechanism (noop emit passed to toolRunner).
