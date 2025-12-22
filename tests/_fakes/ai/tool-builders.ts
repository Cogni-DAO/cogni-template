// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/_fakes/ai/tool-builders`
 * Purpose: Builder functions for creating tool-related test data.
 * Scope: Tool fixtures for testing tool-runner, registry, and message serialization. Does NOT contain runtime logic.
 * Invariants: Deterministic output; stable IDs; OpenAI-compatible formats.
 * Side-effects: none
 * Notes: Use these builders in tool use MVP tests.
 * Links: tool-runner.ts, tool-registry.ts, litellm.adapter.ts
 * @public
 */

import type { Message, MessageToolCall } from "@/core";
import type {
  AiEvent,
  BoundTool,
  ToolContract,
  ToolImplementation,
} from "@/features/ai/types";
import type { LlmToolCall, LlmToolDefinition } from "@/ports";

// ─────────────────────────────────────────────────────────────────────────────
// Test Tool Constants
// ─────────────────────────────────────────────────────────────────────────────

export const TEST_TOOL_NAME = "test_tool" as const;
export const TEST_TOOL_CALL_ID = "call_test_123";

// ─────────────────────────────────────────────────────────────────────────────
// Bound Tool Builders
// ─────────────────────────────────────────────────────────────────────────────

export interface TestToolInput {
  value: string;
}

export interface TestToolOutput {
  result: string;
  secret: string;
}

export interface TestToolRedacted {
  result: string;
}

/**
 * Create a test tool contract with configurable behavior.
 */
export function createTestToolContract(
  options: {
    name?: string;
    validateInputThrows?: boolean;
    validateOutputThrows?: boolean;
    allowlist?: readonly string[];
  } = {}
): ToolContract<string, TestToolInput, TestToolOutput, TestToolRedacted> {
  const name = options.name ?? TEST_TOOL_NAME;
  return {
    name,
    validateInput: (input: unknown): TestToolInput => {
      if (options.validateInputThrows) {
        throw new Error("Input validation failed");
      }
      const obj = input as Record<string, unknown>;
      if (typeof obj?.value !== "string") {
        throw new Error("Missing required field: value");
      }
      return { value: obj.value };
    },
    validateOutput: (output: unknown): TestToolOutput => {
      if (options.validateOutputThrows) {
        throw new Error("Output validation failed");
      }
      const obj = output as Record<string, unknown>;
      return {
        result: String(obj?.result ?? ""),
        secret: String(obj?.secret ?? ""),
      };
    },
    redact: (output: TestToolOutput): TestToolRedacted => {
      return { result: output.result };
    },
    allowlist: (options.allowlist ?? [
      "result",
    ]) as readonly (keyof TestToolOutput)[],
  };
}

/**
 * Create a test tool implementation with configurable behavior.
 */
export function createTestToolImplementation(
  options: {
    result?: string;
    secret?: string;
    throws?: boolean;
    errorMessage?: string;
  } = {}
): ToolImplementation<TestToolInput, TestToolOutput> {
  return {
    execute: async (input: TestToolInput): Promise<TestToolOutput> => {
      if (options.throws) {
        throw new Error(options.errorMessage ?? "Tool execution failed");
      }
      return {
        result: options.result ?? `Processed: ${input.value}`,
        secret: options.secret ?? "hidden_data",
      };
    },
  };
}

/**
 * Create a complete bound tool for testing.
 */
export function createTestBoundTool(
  options: {
    name?: string;
    result?: string;
    validateInputThrows?: boolean;
    validateOutputThrows?: boolean;
    executionThrows?: boolean;
    allowlist?: readonly string[];
  } = {}
): BoundTool<string, TestToolInput, TestToolOutput, TestToolRedacted> {
  return {
    contract: createTestToolContract({
      name: options.name,
      validateInputThrows: options.validateInputThrows,
      validateOutputThrows: options.validateOutputThrows,
      allowlist: options.allowlist,
    }),
    implementation: createTestToolImplementation({
      result: options.result,
      throws: options.executionThrows,
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM Tool Call Builders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create an LLM tool call (as returned by LLM response).
 */
export function createLlmToolCall(
  options: {
    id?: string;
    name?: string;
    arguments?: string | Record<string, unknown>;
  } = {}
): LlmToolCall {
  const args =
    typeof options.arguments === "string"
      ? options.arguments
      : JSON.stringify(options.arguments ?? { value: "test" });
  return {
    id: options.id ?? TEST_TOOL_CALL_ID,
    type: "function",
    function: {
      name: options.name ?? TEST_TOOL_NAME,
      arguments: args,
    },
  };
}

/**
 * Create an LLM tool definition (for sending to LLM).
 */
export function createLlmToolDefinition(
  options: { name?: string; description?: string } = {}
): LlmToolDefinition {
  return {
    type: "function",
    function: {
      name: options.name ?? TEST_TOOL_NAME,
      description: options.description ?? "A test tool for testing",
      parameters: {
        type: "object",
        properties: {
          value: { type: "string", description: "Test value" },
        },
        required: ["value"],
        additionalProperties: false,
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Message Builders for Tool Use
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create an assistant message with tool calls.
 */
export function createAssistantMessageWithToolCalls(
  toolCalls: MessageToolCall[],
  content = ""
): Message {
  return {
    role: "assistant",
    content,
    toolCalls,
  };
}

/**
 * Create a tool result message.
 */
export function createToolResultMessage(
  toolCallId: string,
  result: Record<string, unknown>
): Message {
  return {
    role: "tool",
    content: JSON.stringify(result),
    toolCallId,
  };
}

/**
 * Create a MessageToolCall (embedded in assistant message).
 */
export function createMessageToolCall(
  options: {
    id?: string;
    name?: string;
    arguments?: string | Record<string, unknown>;
  } = {}
): MessageToolCall {
  const args =
    typeof options.arguments === "string"
      ? options.arguments
      : JSON.stringify(options.arguments ?? { value: "test" });
  return {
    id: options.id ?? TEST_TOOL_CALL_ID,
    name: options.name ?? TEST_TOOL_NAME,
    arguments: args,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Collection Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create an event collector for testing tool-runner emissions.
 */
export function createEventCollector(): {
  emit: (event: AiEvent) => void;
  events: AiEvent[];
  getByType: <T extends AiEvent["type"]>(
    type: T
  ) => Extract<AiEvent, { type: T }>[];
} {
  const events: AiEvent[] = [];
  return {
    emit: (event: AiEvent) => events.push(event),
    events,
    getByType: <T extends AiEvent["type"]>(type: T) =>
      events.filter((e): e is Extract<AiEvent, { type: T }> => e.type === type),
  };
}
