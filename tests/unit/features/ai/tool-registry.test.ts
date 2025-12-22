// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/unit/features/ai/tool-registry.test`
 * Purpose: Tests tool registry graph→tool mapping and LLM definition generation.
 * Scope: Unit tests for getToolsForGraph. Does NOT test tool execution or LLM integration.
 * Invariants:
 *   - Graph→tool mapping returns correct tools for each graph
 *   - LLM definitions match OpenAI function-calling format
 *   - Unknown graphs return empty arrays (not errors)
 * Side-effects: none
 * Notes: MVP tool use tests per TOOL_USE_SPEC.md
 * Links: tool-registry.ts, get-current-time.tool.ts
 * @public
 */

import { describe, expect, it } from "vitest";

import {
  getRegisteredToolNames,
  getToolsForGraph,
  isRegisteredTool,
} from "@/features/ai/tool-registry";
import { GET_CURRENT_TIME_NAME } from "@/features/ai/tools/get-current-time.tool";

describe("features/ai/tool-registry", () => {
  describe("getToolsForGraph()", () => {
    it("returns get_current_time for chat_graph", () => {
      // Act
      const { llmDefinitions, boundTools } = getToolsForGraph("chat_graph");

      // Assert
      expect(llmDefinitions).toHaveLength(1);
      expect(llmDefinitions[0].function.name).toBe(GET_CURRENT_TIME_NAME);
      expect(Object.keys(boundTools)).toContain(GET_CURRENT_TIME_NAME);
    });

    it("returns empty arrays for unknown graph", () => {
      // Act
      const { llmDefinitions, boundTools } = getToolsForGraph("unknown_graph");

      // Assert
      expect(llmDefinitions).toHaveLength(0);
      expect(Object.keys(boundTools)).toHaveLength(0);
    });

    it("llmDefinitions match OpenAI function-calling format", () => {
      // Act
      const { llmDefinitions } = getToolsForGraph("chat_graph");

      // Assert - OpenAI format compliance
      for (const def of llmDefinitions) {
        // Must have type: "function"
        expect(def.type).toBe("function");

        // Must have function object with required fields
        expect(def.function).toBeDefined();
        expect(typeof def.function.name).toBe("string");
        expect(def.function.name.length).toBeGreaterThan(0);

        // Parameters must be valid JSON Schema
        expect(def.function.parameters).toBeDefined();
        expect(def.function.parameters.type).toBe("object");
        expect(def.function.parameters).toHaveProperty("properties");
      }
    });

    it("boundTools have contract and implementation", () => {
      // Act
      const { boundTools } = getToolsForGraph("chat_graph");

      // Assert
      for (const [name, tool] of Object.entries(boundTools)) {
        expect(tool.contract).toBeDefined();
        expect(tool.contract.name).toBe(name);
        expect(typeof tool.contract.validateInput).toBe("function");
        expect(typeof tool.contract.validateOutput).toBe("function");
        expect(typeof tool.contract.redact).toBe("function");
        expect(Array.isArray(tool.contract.allowlist)).toBe(true);

        expect(tool.implementation).toBeDefined();
        expect(typeof tool.implementation.execute).toBe("function");
      }
    });
  });

  describe("isRegisteredTool()", () => {
    it("returns true for registered tool", () => {
      expect(isRegisteredTool(GET_CURRENT_TIME_NAME)).toBe(true);
    });

    it("returns false for unregistered tool", () => {
      expect(isRegisteredTool("nonexistent_tool")).toBe(false);
    });
  });

  describe("getRegisteredToolNames()", () => {
    it("includes get_current_time", () => {
      const names = getRegisteredToolNames();
      expect(names).toContain(GET_CURRENT_TIME_NAME);
    });
  });
});
