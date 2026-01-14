// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/tests/runtime/langchain-tools`
 * Purpose: Tool wrapper correlation test - verifies toolCallId stability across events.
 * Scope: Tests that toLangChainTools produces tools that emit correlated events. Does NOT test actual tool execution or LLM integration.
 * Invariants:
 *   - TOOLCALL_ID_STABLE: Same toolCallId across tool_call_start → tool_call_result
 *   - tool_call_start precedes tool_call_result for given toolCallId (OPT1)
 * Side-effects: none (all mocked)
 * Links: TOOL_USE_SPEC.md, langchain-tools.ts
 * @internal
 */

import type { AiEvent } from "@cogni/ai-core";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  type ToolExecFn,
  toLangChainTools,
} from "../../src/runtime/langchain-tools";

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a simple test tool contract.
 */
function createTestContract() {
  return {
    name: "test_tool",
    description: "A test tool for testing",
    effect: "read_only" as const,
    inputSchema: z.object({ value: z.string() }),
    outputSchema: z.object({ result: z.string() }),
    allowlist: ["result"] as readonly string[],
    redact: (output: { result: string }) => ({ result: output.result }),
  };
}

/**
 * Create event collector for testing.
 */
function createEventCollector(): {
  emit: (e: AiEvent) => void;
  events: AiEvent[];
} {
  const events: AiEvent[] = [];
  return {
    emit: (e: AiEvent) => events.push(e),
    events,
  };
}

/**
 * Create a mock ToolExecFn that simulates toolRunner behavior.
 * Emits tool_call_start, executes, then emits tool_call_result.
 */
function createMockToolExecFn(
  collector: ReturnType<typeof createEventCollector>
): ToolExecFn {
  // Counter to generate stable IDs for this test
  let callCount = 0;

  return async (name, args) => {
    callCount++;
    const toolCallId = `test-call-${callCount}`;

    // Emit start event
    collector.emit({
      type: "tool_call_start",
      toolCallId,
      toolName: name,
      args: args as Record<string, unknown>,
    });

    // "Execute" the tool
    const result = {
      result: `processed: ${(args as { value: string }).value}`,
    };

    // Emit result event
    collector.emit({
      type: "tool_call_result",
      toolCallId,
      result,
    });

    return { ok: true, value: result };
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool Correlation Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("toLangChainTools", () => {
  it("emits tool_call_start then tool_call_result with same toolCallId (OPT1)", async () => {
    const collector = createEventCollector();
    const contract = createTestContract();
    const mockExec = createMockToolExecFn(collector);

    // Wrap tool with toLangChainTools
    const tools = toLangChainTools({
      contracts: [contract],
      exec: mockExec,
    });

    expect(tools).toHaveLength(1);
    const wrappedTool = tools[0];

    // Invoke the wrapped tool with toolIds in configurable (required for deny-by-default)
    await wrappedTool.invoke(
      { value: "hello" },
      { configurable: { toolIds: ["test_tool"] } }
    );

    // Verify events were emitted
    const startEvents = collector.events.filter(
      (e) => e.type === "tool_call_start"
    );
    const resultEvents = collector.events.filter(
      (e) => e.type === "tool_call_result"
    );

    expect(startEvents).toHaveLength(1);
    expect(resultEvents).toHaveLength(1);

    // TOOLCALL_ID_STABLE: same toolCallId across start → result
    const startEvent = startEvents[0] as {
      type: "tool_call_start";
      toolCallId: string;
    };
    const resultEvent = resultEvents[0] as {
      type: "tool_call_result";
      toolCallId: string;
    };
    expect(startEvent.toolCallId).toBe(resultEvent.toolCallId);

    // OPT1: start precedes result
    const startIndex = collector.events.findIndex(
      (e) => e.type === "tool_call_start"
    );
    const resultIndex = collector.events.findIndex(
      (e) => e.type === "tool_call_result"
    );
    expect(startIndex).toBeLessThan(resultIndex);

    // Verify tool name matches
    expect(startEvent.toolName).toBe("test_tool");
  });
});
