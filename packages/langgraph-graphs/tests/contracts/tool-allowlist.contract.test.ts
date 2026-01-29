// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/tests/contracts/tool-allowlist.contract`
 * Purpose: Lock TOOLS_DENY_BY_DEFAULT invariant at tool wrapper boundary.
 * Scope: Tests makeLangChainTool allowlist enforcement. Does NOT test full tool execution.
 * Invariants:
 *   - TOOLS_DENY_BY_DEFAULT: If toolIds missing or tool not in list, return policy_denied
 *   - Tool in allowlist => exec called
 *   - Tool not in allowlist => exec NOT called
 * Side-effects: none (all mocked)
 * Links: TOOL_USE_SPEC.md, langchain-tools.ts
 * @internal
 */

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { makeLangChainTool } from "../../src/runtime/langchain-tools";

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a minimal tool contract for testing.
 */
function createTestContract(name: string) {
  return {
    name,
    description: `Test tool: ${name}`,
    effect: "read_only" as const,
    inputSchema: z.object({ input: z.string() }),
    outputSchema: z.object({ output: z.string() }),
    allowlist: ["output"] as readonly string[],
    redact: (o: { output: string }) => o,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Contract Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("makeLangChainTool (tool allowlist contract)", () => {
  describe("deny-by-default", () => {
    it("returns policy_denied when toolIds is undefined", async () => {
      const execFn = vi.fn().mockResolvedValue({ ok: true, value: {} });
      const tool = makeLangChainTool({
        contract: createTestContract("test_tool"),
        execResolver: () => execFn,
      });

      // Invoke without toolIds in configurable
      const result = await tool.invoke({ input: "test" }, { configurable: {} });

      // Should deny without calling exec
      expect(execFn).not.toHaveBeenCalled();
      expect(result).toContain("policy_denied");
      expect(result).toContain("no toolIds configured");
    });

    it("returns policy_denied when toolIds is empty array", async () => {
      const execFn = vi.fn().mockResolvedValue({ ok: true, value: {} });
      const tool = makeLangChainTool({
        contract: createTestContract("test_tool"),
        execResolver: () => execFn,
      });

      const result = await tool.invoke(
        { input: "test" },
        { configurable: { toolIds: [] } }
      );

      expect(execFn).not.toHaveBeenCalled();
      expect(result).toContain("policy_denied");
    });

    it("returns policy_denied when tool not in toolIds", async () => {
      const execFn = vi.fn().mockResolvedValue({ ok: true, value: {} });
      const tool = makeLangChainTool({
        contract: createTestContract("test_tool"),
        execResolver: () => execFn,
      });

      const result = await tool.invoke(
        { input: "test" },
        { configurable: { toolIds: ["other_tool", "another_tool"] } }
      );

      expect(execFn).not.toHaveBeenCalled();
      expect(result).toContain("policy_denied");
      expect(result).toContain("not in allowed toolIds");
    });
  });

  describe("allowlist enforcement", () => {
    it("calls exec when tool is in toolIds", async () => {
      const execFn = vi.fn().mockResolvedValue({
        ok: true,
        value: { output: "success" },
      });
      const tool = makeLangChainTool({
        contract: createTestContract("test_tool"),
        execResolver: () => execFn,
      });

      const result = await tool.invoke(
        { input: "test" },
        { configurable: { toolIds: ["test_tool"] } }
      );

      // Exec should be called
      expect(execFn).toHaveBeenCalledTimes(1);
      expect(execFn).toHaveBeenCalledWith(
        "test_tool",
        { input: "test" },
        undefined
      );

      // Result should be the exec result
      expect(result).toContain("success");
    });

    it("calls exec when tool is among multiple allowed tools", async () => {
      const execFn = vi.fn().mockResolvedValue({
        ok: true,
        value: { output: "worked" },
      });
      const tool = makeLangChainTool({
        contract: createTestContract("target_tool"),
        execResolver: () => execFn,
      });

      const result = await tool.invoke(
        { input: "data" },
        { configurable: { toolIds: ["other", "target_tool", "another"] } }
      );

      expect(execFn).toHaveBeenCalledTimes(1);
      expect(result).toContain("worked");
    });
  });

  describe("exec error propagation", () => {
    it("returns error result from exec when ok=false", async () => {
      const execFn = vi.fn().mockResolvedValue({
        ok: false,
        errorCode: "execution_error",
        safeMessage: "Tool failed safely",
      });
      const tool = makeLangChainTool({
        contract: createTestContract("failing_tool"),
        execResolver: () => execFn,
      });

      const result = await tool.invoke(
        { input: "test" },
        { configurable: { toolIds: ["failing_tool"] } }
      );

      expect(execFn).toHaveBeenCalledTimes(1);
      expect(result).toContain("execution_error");
      expect(result).toContain("Tool failed safely");
    });
  });
});
