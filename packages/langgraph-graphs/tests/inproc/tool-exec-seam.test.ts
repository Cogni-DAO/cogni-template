// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/tests/inproc/tool-exec-seam`
 * Purpose: Integration test for runner's ToolExecFn seam - verifies events flow through provided callback.
 * Scope: Tests createInProcGraphRunner emits tool events via injected ToolExecFn. Does NOT test real tool-runner from src/ (policy, validation, redaction).
 * Invariants:
 *   - Runner passes emit callback to createToolExecFn
 *   - Tool events flow to stream when ToolExecFn emits them
 *   - done is last event
 * Side-effects: none (all mocked at completion boundary)
 * Links: LANGGRAPH_AI.md, runner.ts
 * @internal
 */

import type { AiEvent } from "@cogni/ai-core";
import type { ToolContract } from "@cogni/ai-tools";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createInProcGraphRunner } from "../../src/inproc/runner";
import type {
  CompletionFn,
  CompletionResult,
  CreateGraphFn,
  ToolExecFn,
} from "../../src/inproc/types";

// ─────────────────────────────────────────────────────────────────────────────
// Test Constants
// ─────────────────────────────────────────────────────────────────────────────

const TEST_TOOL_NAME = "test__echo";
const TEST_TOOL_CALL_ID = "tc_integration_001";
const TEST_RUN_ID = "run_integration_001";
const TEST_MODEL = "test-model";

// ─────────────────────────────────────────────────────────────────────────────
// Test Tool Contract
// ─────────────────────────────────────────────────────────────────────────────

const TestEchoInputSchema = z.object({
  message: z.string(),
});

const TestEchoOutputSchema = z.object({
  echo: z.string(),
});

const testToolContract: ToolContract<
  typeof TEST_TOOL_NAME,
  { message: string },
  { echo: string },
  { echo: string }
> = {
  name: TEST_TOOL_NAME,
  description: "Test echo tool that returns the input message",
  effect: "read_only",
  inputSchema: TestEchoInputSchema,
  outputSchema: TestEchoOutputSchema,
  allowlist: ["echo"] as const,
  redact: (output) => ({ echo: output.echo }),
};

/**
 * Tool that exists in contracts but will be denied by policy.
 * This simulates a tool the LLM can "see" but policy blocks.
 */
const DENIED_TOOL_NAME = "denied_tool";

const deniedToolContract: ToolContract<
  typeof DENIED_TOOL_NAME,
  { message: string },
  { echo: string },
  { echo: string }
> = {
  name: DENIED_TOOL_NAME,
  description: "Tool that will be denied by policy",
  effect: "read_only",
  inputSchema: TestEchoInputSchema,
  outputSchema: TestEchoOutputSchema,
  allowlist: ["echo"] as const,
  redact: (output) => ({ echo: output.echo }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Test Graph Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Graph factory using createReactAgent.
 * Properly handles tool-calling loop.
 */
const testGraphFactory: CreateGraphFn = (opts) => {
  return createReactAgent({
    llm: opts.llm,
    tools: opts.tools,
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Stateful Completion Mock
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create stateful completion function:
 * - Call #1: Returns tool_calls (triggers tool execution)
 * - Call #2+: Returns stop (terminates graph)
 */
function createStatefulCompletionFn(options: {
  toolName: string;
  toolCallId: string;
  toolArgs: Record<string, unknown>;
}): CompletionFn {
  let callCount = 0;

  return () => {
    callCount++;

    if (callCount === 1) {
      // First call: LLM decides to use tool
      const stream = (async function* () {
        yield { type: "text_delta" as const, delta: "Let me help..." };
      })();

      const final: Promise<CompletionResult> = Promise.resolve({
        ok: true,
        content: "",
        toolCalls: [
          {
            id: options.toolCallId,
            type: "function" as const,
            function: {
              name: options.toolName,
              arguments: JSON.stringify(options.toolArgs),
            },
          },
        ],
        usage: { promptTokens: 10, completionTokens: 5 },
        finishReason: "tool_calls",
      });

      return { stream, final };
    }

    // Subsequent calls: LLM responds normally (terminates)
    const stream = (async function* () {
      yield { type: "text_delta" as const, delta: "Here's the result." };
    })();

    const final: Promise<CompletionResult> = Promise.resolve({
      ok: true,
      content: "Here's the result.",
      usage: { promptTokens: 15, completionTokens: 8 },
      finishReason: "stop",
    });

    return { stream, final };
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool Execution Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create tool execution function with spy and event emission.
 * Simulates what the real createToolExecFn in the provider does.
 */
function createSpyableToolExecFn(
  allowedTools: Set<string>,
  executeSpy: ReturnType<typeof vi.fn>
): (emit: (e: AiEvent) => void) => ToolExecFn {
  return (emit) => {
    return async (name, args, toolCallId) => {
      const tcId = toolCallId ?? `generated_${Date.now()}`;

      // Check if tool is allowed (simulates policy check)
      if (!allowedTools.has(name)) {
        // Emit result with error for unavailable tool
        emit({
          type: "tool_call_result",
          toolCallId: tcId,
          result: { error: "unavailable" },
          isError: true,
        });
        return { ok: false, errorCode: "unavailable" };
      }

      // Emit start event
      emit({
        type: "tool_call_start",
        toolCallId: tcId,
        toolName: name,
        args: args as Record<string, unknown>,
      });

      // Execute tool
      const result = executeSpy(args);

      // Emit result event
      emit({
        type: "tool_call_result",
        toolCallId: tcId,
        result,
      });

      return { ok: true, value: result };
    };
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Collection Helper
// ─────────────────────────────────────────────────────────────────────────────

async function collectEvents(
  stream: AsyncIterable<AiEvent>
): Promise<AiEvent[]> {
  const events: AiEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Runner ToolExecFn seam (integration)", () => {
  describe("allowlisted tool", () => {
    it("executes and emits correlated tool_call_start/result", async () => {
      // Create spy for tool execution
      const executeSpy = vi
        .fn()
        .mockReturnValue({ echo: "echoed: hello world" });

      // Create completion function that returns tool_calls
      const completionFn = createStatefulCompletionFn({
        toolName: TEST_TOOL_NAME,
        toolCallId: TEST_TOOL_CALL_ID,
        toolArgs: { message: "hello world" },
      });

      // Create tool exec factory with our tool allowed
      const createToolExecFn = createSpyableToolExecFn(
        new Set([TEST_TOOL_NAME]),
        executeSpy
      );

      // Run the graph
      const { stream, final } = createInProcGraphRunner({
        createGraph: testGraphFactory,
        completionFn,
        createToolExecFn,
        toolContracts: [testToolContract],
        request: {
          runId: TEST_RUN_ID,
          messages: [{ role: "user", content: "Echo hello world" }],
          model: TEST_MODEL,
        },
      });

      const events = await collectEvents(stream);
      const result = await final;

      // Assertions
      const toolStarts = events.filter((e) => e.type === "tool_call_start");
      const toolResults = events.filter((e) => e.type === "tool_call_result");
      const dones = events.filter((e) => e.type === "done");
      const errors = events.filter((e) => e.type === "error");

      // Exactly 1 tool_call_start
      expect(toolStarts).toHaveLength(1);

      // Exactly 1 tool_call_result
      expect(toolResults).toHaveLength(1);

      // Same toolCallId (TOOLCALL_ID_STABLE)
      const startEvent = toolStarts[0] as {
        type: "tool_call_start";
        toolCallId: string;
      };
      const resultEvent = toolResults[0] as {
        type: "tool_call_result";
        toolCallId: string;
      };
      expect(startEvent.toolCallId).toBe(resultEvent.toolCallId);

      // start < result ordering
      const startIndex = events.findIndex((e) => e.type === "tool_call_start");
      const resultIndex = events.findIndex(
        (e) => e.type === "tool_call_result"
      );
      expect(startIndex).toBeLessThan(resultIndex);

      // done is last
      expect(dones).toHaveLength(1);
      expect(events[events.length - 1]).toEqual({ type: "done" });

      // No error events
      expect(errors).toHaveLength(0);

      // Tool was executed
      expect(executeSpy).toHaveBeenCalledTimes(1);
      expect(executeSpy).toHaveBeenCalledWith({ message: "hello world" });

      // Final result is success
      expect(result.ok).toBe(true);
    });
  });

  describe("non-allowlisted tool", () => {
    it("denies and does not execute implementation", async () => {
      // Create spy for tool execution
      const executeSpy = vi
        .fn()
        .mockReturnValue({ echo: "should not see this" });

      // Create completion function that returns the DENIED tool
      // (exists in contracts, but not in policy allowlist)
      const completionFn = createStatefulCompletionFn({
        toolName: DENIED_TOOL_NAME,
        toolCallId: TEST_TOOL_CALL_ID,
        toolArgs: { message: "test" },
      });

      // Create tool exec factory with ONLY TEST_TOOL_NAME allowed
      // DENIED_TOOL_NAME is NOT in this set, so it will be rejected
      const createToolExecFn = createSpyableToolExecFn(
        new Set([TEST_TOOL_NAME]),
        executeSpy
      );

      const { stream, final } = createInProcGraphRunner({
        createGraph: testGraphFactory,
        completionFn,
        createToolExecFn,
        // Include BOTH tools in contracts so LangGraph can "see" them
        // But only TEST_TOOL_NAME is in the allowed set
        toolContracts: [testToolContract, deniedToolContract],
        request: {
          runId: TEST_RUN_ID,
          messages: [{ role: "user", content: "Use denied tool" }],
          model: TEST_MODEL,
        },
      });

      const events = await collectEvents(stream);
      await final;

      const dones = events.filter((e) => e.type === "done");
      const toolResults = events.filter((e) => e.type === "tool_call_result");

      // Tool implementation was NOT called (policy denied)
      expect(executeSpy).not.toHaveBeenCalled();

      // done is last
      expect(dones).toHaveLength(1);
      expect(events[events.length - 1]).toEqual({ type: "done" });

      // Should have a tool_call_result with error
      expect(toolResults.length).toBeGreaterThanOrEqual(1);
      const errorResult = toolResults[0] as {
        type: "tool_call_result";
        isError?: boolean;
        result?: { error?: string };
      };
      expect(errorResult.isError).toBe(true);
    });
  });
});
