// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/ai/tool-runner`
 * Purpose: Tool execution with AiEvent emission and payload redaction.
 * Scope: Sole owner of toolCallId generation; executes tools via injected implementations. Does not import adapters.
 * Invariants:
 *   - GRAPHS_USE_TOOLRUNNER_ONLY: Graphs invoke tools exclusively through toolRunner.exec()
 *   - TOOLCALL_ID_STABLE: Same toolCallId across start→result
 *   - TOOLRUNNER_ALLOWLIST_HARD_FAIL: Missing allowlist or redaction failure → error event
 *   - TOOLRUNNER_RESULT_SHAPE: Returns {ok:true, value} | {ok:false, errorCode, safeMessage}
 *   - TOOLRUNNER_PIPELINE_ORDER: validate args → execute → validate result → redact → emit → return
 * Side-effects: none (AiEvent emission via injected callback is caller's responsibility)
 * Notes: Per AI_SETUP_SPEC.md P1 invariants
 * Links: types.ts, ai_runtime.ts, AI_SETUP_SPEC.md
 * @public
 */

import { randomUUID } from "node:crypto";

import type {
  AiEvent,
  BoundTool,
  ToolCallResultEvent,
  ToolCallStartEvent,
  ToolResult,
} from "./types";

/**
 * Callback for emitting AiEvents during tool execution.
 * Used by tool-runner to stream events to runtime.
 */
export type EmitAiEvent = (event: AiEvent) => void;

/**
 * Options for tool execution.
 */
export interface ToolExecOptions {
  /** Model-provided tool call ID (use this if available, else generate UUID) */
  readonly modelToolCallId?: string;
}

/**
 * Create a tool runner instance with the given bound tools.
 * The runner executes tools and emits AiEvents via the provided callback.
 *
 * @param boundTools - Map of tool name to bound tool (contract + implementation)
 * @param emit - Callback to emit AiEvents
 * @returns Tool runner with exec method
 */
export function createToolRunner<
  TTools extends Record<
    string,
    BoundTool<string, unknown, unknown, Record<string, unknown>>
  >,
>(boundTools: TTools, emit: EmitAiEvent) {
  /**
   * Execute a tool by name with given arguments.
   * Follows fixed pipeline per TOOLRUNNER_PIPELINE_ORDER.
   *
   * @param toolName - Name of the tool to execute
   * @param rawArgs - Raw arguments to pass to the tool
   * @param options - Execution options (e.g., model-provided toolCallId)
   * @returns ToolResult with redacted value on success, error info on failure
   */
  async function exec<TName extends keyof TTools & string>(
    toolName: TName,
    rawArgs: unknown,
    options?: ToolExecOptions
  ): Promise<ToolResult<Record<string, unknown>>> {
    // Generate stable toolCallId (model-provided or UUID)
    const toolCallId = options?.modelToolCallId ?? randomUUID();

    // Look up bound tool
    const boundTool = boundTools[toolName];
    if (!boundTool) {
      const errorEvent: ToolCallResultEvent = {
        type: "tool_call_result",
        toolCallId,
        result: { error: `Tool '${toolName}' not found` },
        isError: true,
      };
      emit(errorEvent);
      return {
        ok: false,
        errorCode: "unavailable",
        safeMessage: `Tool '${toolName}' is not available`,
      };
    }

    const { contract, implementation } = boundTool;

    // 1. Validate args via inputSchema
    let validatedInput: unknown;
    try {
      validatedInput = contract.inputSchema.parse(rawArgs);
    } catch (err) {
      const safeMessage =
        err instanceof Error ? err.message : "Invalid tool arguments";
      const errorEvent: ToolCallResultEvent = {
        type: "tool_call_result",
        toolCallId,
        result: { error: safeMessage },
        isError: true,
      };
      emit(errorEvent);
      return {
        ok: false,
        errorCode: "validation",
        safeMessage,
      };
    }

    // Emit tool_call_start with validated (possibly redacted) args
    const startEvent: ToolCallStartEvent = {
      type: "tool_call_start",
      toolCallId,
      toolName,
      args: validatedInput as Record<string, unknown>,
    };
    emit(startEvent);

    // 2. Execute tool
    let rawOutput: unknown;
    try {
      rawOutput = await implementation.execute(validatedInput);
    } catch (err) {
      const safeMessage =
        err instanceof Error ? err.message : "Tool execution failed";
      const errorEvent: ToolCallResultEvent = {
        type: "tool_call_result",
        toolCallId,
        result: { error: safeMessage },
        isError: true,
      };
      emit(errorEvent);
      return {
        ok: false,
        errorCode: "execution",
        safeMessage,
      };
    }

    // 3. Validate result via outputSchema
    let validatedOutput: unknown;
    try {
      validatedOutput = contract.outputSchema.parse(rawOutput);
    } catch (err) {
      const safeMessage =
        err instanceof Error ? err.message : "Invalid tool output";
      const errorEvent: ToolCallResultEvent = {
        type: "tool_call_result",
        toolCallId,
        result: { error: safeMessage },
        isError: true,
      };
      emit(errorEvent);
      return {
        ok: false,
        errorCode: "validation",
        safeMessage,
      };
    }

    // 4. Redact per allowlist (hard-fail if missing/fails)
    let redactedOutput: Record<string, unknown>;
    try {
      if (contract.allowlist.length === 0) {
        throw new Error(`Tool '${toolName}' has no allowlist defined`);
      }
      redactedOutput = contract.redact(validatedOutput);
    } catch (err) {
      const safeMessage =
        err instanceof Error ? err.message : "Redaction failed";
      const errorEvent: ToolCallResultEvent = {
        type: "tool_call_result",
        toolCallId,
        result: { error: "Internal error processing tool result" },
        isError: true,
      };
      emit(errorEvent);
      return {
        ok: false,
        errorCode: "redaction_failed",
        safeMessage,
      };
    }

    // 5. Emit tool_call_result with redacted output
    const resultEvent: ToolCallResultEvent = {
      type: "tool_call_result",
      toolCallId,
      result: redactedOutput,
    };
    emit(resultEvent);

    // 6. Return result
    return {
      ok: true,
      value: redactedOutput,
    };
  }

  return { exec };
}

/**
 * Type for the tool runner instance.
 */
export type ToolRunner = ReturnType<typeof createToolRunner>;
