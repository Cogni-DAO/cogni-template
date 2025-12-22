// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/ai/types`
 * Purpose: Internal type definitions for AI feature streaming and tool lifecycle.
 * Scope: Re-exports AiEvent types from @/types/ai-events, defines StreamFinalResult and tool-runner types. Feature-internal, NOT in shared/.
 * Invariants:
 *   - AiEvents are the ONLY output type from ai_runtime
 *   - toolCallId must be stable across start→result lifecycle
 *   - Route layer maps AiEvents to assistant-stream format (never runtime)
 *   - UsageReportEvent carries UsageFact for billing subscriber (never to UI)
 * Side-effects: none (types only)
 * Notes: Per AI_SETUP_SPEC.md P1 invariant AI_RUNTIME_EMITS_AIEVENTS, GRAPH_EXECUTION.md
 * Links: ai_runtime.ts, tool-runner.ts, AI_SETUP_SPEC.md, GRAPH_EXECUTION.md, @/types/ai-events.ts
 * @internal
 */

// Re-export shared AI event types from types layer
export type {
  AiEvent,
  DoneEvent,
  TextDeltaEvent,
  ToolCallResultEvent,
  ToolCallStartEvent,
  UsageReportEvent,
} from "@/types/ai-events";

/**
 * Stream final result - discriminated union for ok/error paths.
 * Per assistant-stream: route must emit FinishMessage with real usage/finishReason.
 * This type enables route to handle all terminal states without exceptions.
 *
 * Billing fields (model, providerCostUsd, litellmCallId) are included for
 * GraphExecutorAdapter to emit usage_report events. Per GRAPH_EXECUTION.md:
 * adapter emits usage_report → billing subscriber calls commitUsageFact().
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
      /** Resolved model ID for billing (from provider response) */
      readonly model?: string;
      /** Provider cost in USD for billing calculation */
      readonly providerCostUsd?: number;
      /** LiteLLM call ID for idempotent billing (usage_unit_id) */
      readonly litellmCallId?: string;
      /** Tool calls requested by LLM (present when finishReason === "tool_calls") */
      readonly toolCalls?: import("@/ports").LlmToolCall[];
    }
  | {
      readonly ok: false;
      readonly requestId: string;
      readonly error: "timeout" | "aborted" | "internal";
    };

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
