// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/ai/types`
 * Purpose: Internal type definitions for AI feature streaming and tool lifecycle.
 * Scope: AiEvent types emitted by ai_runtime, StreamFinalResult for completion, and tool-runner types. Feature-internal, NOT in shared/.
 * Invariants:
 *   - AiEvents are the ONLY output type from ai_runtime
 *   - toolCallId must be stable across start→result lifecycle
 *   - Route layer maps AiEvents to assistant-stream format (never runtime)
 * Side-effects: none (types only)
 * Notes: Per AI_SETUP_SPEC.md P1 invariant AI_RUNTIME_EMITS_AIEVENTS
 * Links: ai_runtime.ts, tool-runner.ts, AI_SETUP_SPEC.md
 * @internal
 */

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
 * Stream completed.
 * Emitted by runtime when the entire response is done.
 */
export interface DoneEvent {
  readonly type: "done";
}

/**
 * Stream final result - discriminated union for ok/error paths.
 * Per assistant-stream: route must emit FinishMessage with real usage/finishReason.
 * This type enables route to handle all terminal states without exceptions.
 */
export type StreamFinalResult =
  | {
      readonly ok: true;
      readonly requestId: string;
      readonly usage: {
        readonly promptTokens: number;
        readonly completionTokens: number;
      };
      readonly finishReason: string;
    }
  | {
      readonly ok: false;
      readonly requestId: string;
      readonly error: "timeout" | "aborted" | "internal";
    };

/**
 * Union of all AI events emitted by ai_runtime.
 * Per AI_RUNTIME_EMITS_AIEVENTS: runtime emits these only; route maps to wire protocol.
 */
export type AiEvent =
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
