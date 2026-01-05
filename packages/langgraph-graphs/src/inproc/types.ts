// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/inproc/types`
 * Purpose: Type definitions for InProc graph execution.
 * Scope: Package-owned types for runner interface. Does NOT import from src/.
 * Invariants:
 *   - PACKAGES_NO_SRC_IMPORTS: No imports from src/**
 *   - Single queue pattern: runner creates queue, passes emit to caller's factory
 * Side-effects: none
 * Links: LANGGRAPH_AI.md
 * @public
 */

import type { AiEvent } from "@cogni/ai-core";
import type { ToolContract } from "@cogni/ai-tools";

import type {
  CompletionFn,
  CompletionResult,
} from "../runtime/completion-unit-llm";
import type { Message } from "../runtime/message-converters";

// Re-export for convenience
export type { CompletionFn, CompletionResult, Message };

/**
 * Result from tool execution via exec function.
 * Matches toolRunner.exec() return shape.
 */
export interface ToolExecResult {
  readonly ok: boolean;
  readonly value?: unknown;
  readonly errorCode?: string;
  readonly safeMessage?: string;
}

/**
 * Tool execution function signature.
 * Called by LangChain tool wrapper, routes through toolRunner.
 *
 * Per TOOLCALLID_STABLE: toolRunner generates canonical toolCallId if undefined.
 * P1 will add providerToolCallId from AIMessage.tool_calls for correlation.
 */
export type ToolExecFn = (
  name: string,
  args: unknown,
  toolCallId?: string
) => Promise<ToolExecResult>;

/**
 * Graph request (subset of GraphRunRequest, no src imports).
 */
export interface InProcGraphRequest {
  readonly runId: string;
  readonly messages: readonly Message[];
  readonly model: string;
  readonly abortSignal?: AbortSignal;
  readonly traceId?: string;
  readonly ingressRequestId?: string;
}

/**
 * Options for createInProcChatRunner.
 * Runner creates queue internally, passes emit to createToolExecFn.
 */
export interface InProcRunnerOptions {
  /** Per-LLM-call completion function (called N times in agentic loop) */
  readonly completionFn: CompletionFn;

  /**
   * Factory that receives emit callback and returns ToolExecFn.
   * Caller wires toolRunner.emit to the emit callback.
   * This ensures tool events flow to the same queue as LLM events.
   */
  readonly createToolExecFn: (emit: (e: AiEvent) => void) => ToolExecFn;

  /** Tool contracts for LangChain tool wrapping */
  readonly toolContracts: ReadonlyArray<
    ToolContract<string, unknown, unknown, unknown>
  >;

  /** Graph execution request */
  readonly request: InProcGraphRequest;
}

/**
 * Graph execution result.
 */
export interface GraphResult {
  readonly ok: boolean;
  readonly usage?: {
    readonly promptTokens: number;
    readonly completionTokens: number;
  };
  readonly finishReason?: string;
  readonly error?: string;
}
