// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/ai/types`
 * Purpose: Internal type definitions for AI feature streaming and tool lifecycle.
 * Scope: UiEvent types emitted by ai.facade and tool-runner. Feature-internal, NOT in shared/.
 * Invariants:
 *   - UiEvents are the ONLY output type from ai.facade
 *   - toolCallId must be stable across start→result lifecycle
 *   - Route layer maps UiEvents to assistant-stream format (never facade)
 * Side-effects: none (types only)
 * Notes: Per AI_SETUP_SPEC.md P1 invariant AI_FACADE_EMITS_UIEVENTS
 * Links: ai.facade.ts, tool-runner.ts, AI_SETUP_SPEC.md
 * @internal
 */

/**
 * Text content streaming from LLM.
 * Emitted by facade when receiving text chunks from LLM stream.
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
 * Stream completed.
 * Emitted by facade when the entire response is done.
 */
export interface DoneEvent {
  readonly type: "done";
}

/**
 * Union of all UI events emitted by ai.facade.
 * Per AI_FACADE_EMITS_UIEVENTS: facade emits these only; route maps to wire protocol.
 */
export type UiEvent =
  | TextDeltaEvent
  | ToolCallStartEvent
  | ToolCallResultEvent
  | DoneEvent;

/**
 * Tool execution result shape.
 * Per TOOLRUNNER_RESULT_SHAPE: exec() returns this discriminated union.
 */
export type ToolResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly errorCode: ToolErrorCode;
      readonly safeMessage: string;
    };

/**
 * Tool error codes.
 * Per TOOLRUNNER_RESULT_SHAPE: standardized error classification.
 */
export type ToolErrorCode =
  | "validation"
  | "execution"
  | "unavailable"
  | "redaction_failed";

/**
 * Tool contract definition.
 * Defines schema and interface for a tool without implementation.
 */
export interface ToolContract<
  TName extends string,
  TInput,
  TOutput,
  TRedacted,
> {
  /** Stable tool name (snake_case) */
  readonly name: TName;
  /** Validate input args, throws on invalid */
  readonly validateInput: (input: unknown) => TInput;
  /** Validate output, throws on invalid */
  readonly validateOutput: (output: unknown) => TOutput;
  /** Redact output to UI-safe fields */
  readonly redact: (output: TOutput) => TRedacted;
  /** Allowlisted fields that appear in redacted output */
  readonly allowlist: ReadonlyArray<keyof TOutput>;
}

/**
 * Tool implementation interface.
 * Adapters implement this; receives validated input, returns raw output.
 */
export interface ToolImplementation<TInput, TOutput> {
  /** Execute the tool with validated input */
  readonly execute: (input: TInput) => Promise<TOutput>;
}

/**
 * Bound tool: contract + implementation together.
 * Created by bootstrap, consumed by tool-runner.
 */
export interface BoundTool<TName extends string, TInput, TOutput, TRedacted> {
  readonly contract: ToolContract<TName, TInput, TOutput, TRedacted>;
  readonly implementation: ToolImplementation<TInput, TOutput>;
}
