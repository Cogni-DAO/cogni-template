// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/unit/features/ai/tool-runner.test`
 * Purpose: Tests tool-runner execution pipeline with validation, redaction, and event emission.
 * Scope: Unit tests for createToolRunner. Does NOT test LLM integration or graph orchestration.
 * Invariants:
 *   - TOOLRUNNER_PIPELINE_ORDER: validate → execute → validate → redact → emit → return
 *   - TOOLCALL_ID_STABLE: Same toolCallId across start→result events
 *   - Event ordering: tool_call_start ALWAYS before tool_call_result
 * Side-effects: none
 * Notes: MVP tool use tests per TOOL_USE_SPEC.md
 * Links: tool-runner.ts, types.ts
 * @public
 */

import {
  createEventCollector,
  createTestBoundTool,
  TEST_TOOL_CALL_ID,
  TEST_TOOL_NAME,
} from "@tests/_fakes";
import { describe, expect, it } from "vitest";

import { createToolRunner } from "@/features/ai/tool-runner";
import type {
  ToolCallResultEvent,
  ToolCallStartEvent,
} from "@/features/ai/types";

describe("features/ai/tool-runner", () => {
  describe("exec()", () => {
    it("returns ok:true with redacted value on success", async () => {
      // Arrange
      const boundTool = createTestBoundTool(); // Uses default: "Processed: ${input.value}"
      const collector = createEventCollector();
      const runner = createToolRunner(
        { [TEST_TOOL_NAME]: boundTool },
        collector.emit
      );

      // Act
      const result = await runner.exec(TEST_TOOL_NAME, { value: "test_input" });

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        // Redacted: should have 'result' but not 'secret'
        expect(result.value).toEqual({ result: "Processed: test_input" });
        expect(result.value).not.toHaveProperty("secret");
      }
    });

    it("returns ok:false with errorCode 'unavailable' for unknown tool", async () => {
      // Arrange
      const collector = createEventCollector();
      const runner = createToolRunner({}, collector.emit);

      // Act
      const result = await runner.exec("unknown_tool", { value: "test" });

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorCode).toBe("unavailable");
        expect(result.safeMessage).toContain("not available");
      }
    });

    it("returns ok:false with errorCode 'validation' on input validation failure", async () => {
      // Arrange
      const boundTool = createTestBoundTool({ validateInputThrows: true });
      const collector = createEventCollector();
      const runner = createToolRunner(
        { [TEST_TOOL_NAME]: boundTool },
        collector.emit
      );

      // Act
      const result = await runner.exec(TEST_TOOL_NAME, { invalid: "args" });

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorCode).toBe("validation");
      }
    });

    it("returns ok:false with errorCode 'execution' on execution error", async () => {
      // Arrange
      const boundTool = createTestBoundTool({ executionThrows: true });
      const collector = createEventCollector();
      const runner = createToolRunner(
        { [TEST_TOOL_NAME]: boundTool },
        collector.emit
      );

      // Act
      const result = await runner.exec(TEST_TOOL_NAME, { value: "test" });

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorCode).toBe("execution");
      }
    });

    it("returns ok:false with errorCode 'redaction_failed' when allowlist is empty", async () => {
      // Arrange
      const boundTool = createTestBoundTool({ allowlist: [] });
      const collector = createEventCollector();
      const runner = createToolRunner(
        { [TEST_TOOL_NAME]: boundTool },
        collector.emit
      );

      // Act
      const result = await runner.exec(TEST_TOOL_NAME, { value: "test" });

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorCode).toBe("redaction_failed");
      }
    });
  });

  describe("event emission", () => {
    it("emits tool_call_start before execution", async () => {
      // Arrange
      const boundTool = createTestBoundTool();
      const collector = createEventCollector();
      const runner = createToolRunner(
        { [TEST_TOOL_NAME]: boundTool },
        collector.emit
      );

      // Act
      await runner.exec(
        TEST_TOOL_NAME,
        { value: "test" },
        { modelToolCallId: TEST_TOOL_CALL_ID }
      );

      // Assert
      const startEvents = collector.getByType("tool_call_start");
      expect(startEvents).toHaveLength(1);
      expect(startEvents[0]).toMatchObject({
        type: "tool_call_start",
        toolCallId: TEST_TOOL_CALL_ID,
        toolName: TEST_TOOL_NAME,
        args: { value: "test" },
      });
    });

    it("emits tool_call_result after execution", async () => {
      // Arrange
      const boundTool = createTestBoundTool(); // Uses default: "Processed: ${input.value}"
      const collector = createEventCollector();
      const runner = createToolRunner(
        { [TEST_TOOL_NAME]: boundTool },
        collector.emit
      );

      // Act
      await runner.exec(
        TEST_TOOL_NAME,
        { value: "test" },
        { modelToolCallId: TEST_TOOL_CALL_ID }
      );

      // Assert
      const resultEvents = collector.getByType("tool_call_result");
      expect(resultEvents).toHaveLength(1);
      expect(resultEvents[0]).toMatchObject({
        type: "tool_call_result",
        toolCallId: TEST_TOOL_CALL_ID,
        result: { result: "Processed: test" },
      });
      expect(resultEvents[0].isError).toBeUndefined();
    });

    it("emits events in correct order: start then result", async () => {
      // Arrange
      const boundTool = createTestBoundTool();
      const collector = createEventCollector();
      const runner = createToolRunner(
        { [TEST_TOOL_NAME]: boundTool },
        collector.emit
      );

      // Act
      await runner.exec(
        TEST_TOOL_NAME,
        { value: "test" },
        { modelToolCallId: TEST_TOOL_CALL_ID }
      );

      // Assert - Event ordering contract
      expect(collector.events).toHaveLength(2);
      expect(collector.events[0].type).toBe("tool_call_start");
      expect(collector.events[1].type).toBe("tool_call_result");
    });

    it("maintains stable toolCallId across start and result events", async () => {
      // Arrange
      const boundTool = createTestBoundTool();
      const collector = createEventCollector();
      const runner = createToolRunner(
        { [TEST_TOOL_NAME]: boundTool },
        collector.emit
      );
      const customToolCallId = "call_stable_id_789";

      // Act
      await runner.exec(
        TEST_TOOL_NAME,
        { value: "test" },
        { modelToolCallId: customToolCallId }
      );

      // Assert - TOOLCALL_ID_STABLE invariant
      const startEvent = collector.events[0] as ToolCallStartEvent;
      const resultEvent = collector.events[1] as ToolCallResultEvent;

      expect(startEvent.toolCallId).toBe(customToolCallId);
      expect(resultEvent.toolCallId).toBe(customToolCallId);
      expect(startEvent.toolCallId).toBe(resultEvent.toolCallId);
    });

    it("emits error result with isError:true on execution failure", async () => {
      // Arrange
      const boundTool = createTestBoundTool({ executionThrows: true });
      const collector = createEventCollector();
      const runner = createToolRunner(
        { [TEST_TOOL_NAME]: boundTool },
        collector.emit
      );

      // Act
      await runner.exec(
        TEST_TOOL_NAME,
        { value: "test" },
        { modelToolCallId: TEST_TOOL_CALL_ID }
      );

      // Assert
      const resultEvents = collector.getByType("tool_call_result");
      expect(resultEvents).toHaveLength(1);
      expect(resultEvents[0].isError).toBe(true);
      expect(resultEvents[0].result).toHaveProperty("error");
    });

    it("generates UUID toolCallId when not provided by model", async () => {
      // Arrange
      const boundTool = createTestBoundTool();
      const collector = createEventCollector();
      const runner = createToolRunner(
        { [TEST_TOOL_NAME]: boundTool },
        collector.emit
      );

      // Act - no modelToolCallId provided
      await runner.exec(TEST_TOOL_NAME, { value: "test" });

      // Assert
      const startEvent = collector.events[0] as ToolCallStartEvent;
      const resultEvent = collector.events[1] as ToolCallResultEvent;

      // Should have a valid UUID-like ID
      expect(startEvent.toolCallId).toBeDefined();
      expect(startEvent.toolCallId.length).toBeGreaterThan(0);
      // Both events should have same ID
      expect(startEvent.toolCallId).toBe(resultEvent.toolCallId);
    });
  });
});
