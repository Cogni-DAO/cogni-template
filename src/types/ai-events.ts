// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@types/ai-events`
 * Purpose: Shared AI event types for streaming and billing.
 * Scope: Defines AiEvent union used by ports and features. Does NOT implement functions.
 * Invariants:
 *   - AiEvents are the ONLY streaming output type from ai_runtime
 *   - toolCallId must be stable across start→result lifecycle
 *   - UsageReportEvent carries UsageFact for billing subscriber (never to UI)
 * Side-effects: none (types only)
 * Links: graph-executor.port.ts, features/ai/types.ts, GRAPH_EXECUTION.md
 * @public
 */

import type { UsageFact } from "./usage";

/**
 * Text content streaming from LLM.
 * Emitted by runtime when receiving text chunks from LLM stream.
 */
export interface TextDeltaEvent {
  readonly type: "text_delta";
  /** Incremental text content */
  readonly delta: string;
}

/**
 * Tool call initiated.
 * Emitted by tool-runner when a tool execution begins.
 * Per TOOLCALL_ID_STABLE: same toolCallId persists across start→result.
 */
export interface ToolCallStartEvent {
  readonly type: "tool_call_start";
  /** Stable ID for this tool call (model-provided or UUID) */
  readonly toolCallId: string;
  /** Tool name (snake_case, stable API identifier) */
  readonly toolName: string;
  /** Tool arguments (validated, may be redacted for streaming) */
  readonly args: Record<string, unknown>;
}

/**
 * Tool call completed.
 * Emitted by tool-runner after tool execution completes (success or error).
 * Per TOOLRUNNER_ALLOWLIST_HARD_FAIL: result is always redacted per allowlist.
 */
export interface ToolCallResultEvent {
  readonly type: "tool_call_result";
  /** Same toolCallId as corresponding start event */
  readonly toolCallId: string;
  /** Redacted result (UI-safe fields only per tool allowlist) */
  readonly result: Record<string, unknown>;
  /** True if tool execution failed */
  readonly isError?: boolean;
}

/**
 * Usage report for billing ingestion.
 * Emitted when an LLM call completes within a graph execution.
 * Per GRAPH_EXECUTION.md: billing subscriber commits facts via commitUsageFact().
 *
 * IMPORTANT: This event is internal to the pump+fanout pattern.
 * It is NOT forwarded to the UI subscriber - only to the billing subscriber.
 */
export interface UsageReportEvent {
  readonly type: "usage_report";
  readonly fact: UsageFact;
}

/**
 * Stream completed.
 * Emitted by runtime when the entire response is done.
 */
export interface DoneEvent {
  readonly type: "done";
}

/**
 * Stream error.
 * Emitted by runtime when an unrecoverable error occurs during streaming.
 * Terminal event: uiStream returns immediately after yielding this.
 */
export interface ErrorEvent {
  readonly type: "error";
  /** Error message or code */
  readonly error: string;
}

/**
 * Union of all AI events emitted by ai_runtime and graph executors.
 * Per AI_RUNTIME_EMITS_AIEVENTS: runtime emits these only; route maps to wire protocol.
 *
 * Note: UsageReportEvent is internal to pump+fanout - billing subscriber only, never to UI.
 */
export type AiEvent =
  | TextDeltaEvent
  | ToolCallStartEvent
  | ToolCallResultEvent
  | UsageReportEvent
  | DoneEvent
  | ErrorEvent;
