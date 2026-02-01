// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/arch/tool-execution-path`
 * Purpose: Enforces ARCH_SINGLE_EXECUTION_PATH - all tool execution via toolRunner.
 * Scope: Tests that graph code cannot import ai-core directly. Does NOT test runtime layer.
 * Invariants: Graph code receives ToolExecFn via DI; cannot access BoundToolRuntime.
 * Side-effects: IO (spawns depcruise subprocess)
 * Notes: Validates no-graphs-to-ai-core rule in .dependency-cruiser.cjs
 * Links: TOOL_USE_SPEC.md (ARCH_SINGLE_EXECUTION_PATH), .dependency-cruiser.cjs
 * @public
 */

import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function runDepCruise(probeDirs: string[]): {
  exitCode: number;
  stderr: string;
  stdout: string;
} {
  const includeOnly = probeDirs.map((d) => `^${d}`).join("|");

  const result = spawnSync(
    "pnpm",
    [
      "depcruise",
      ...probeDirs,
      "--config",
      ".dependency-cruiser.cjs",
      "--include-only",
      includeOnly,
      "--output-type",
      "err",
    ],
    {
      encoding: "utf-8",
      cwd: process.cwd(),
    }
  );

  return {
    exitCode: result.status ?? 1,
    stderr: result.stderr,
    stdout: result.stdout,
  };
}

describe("Tool execution path (ARCH_SINGLE_EXECUTION_PATH)", () => {
  describe("Graph code isolation from ai-core", () => {
    it("graphs/ does not import from @cogni/ai-core", () => {
      // Graphs should only use ToolExecFn via runtime layer DI
      // This prevents direct access to BoundToolRuntime.exec()
      const { exitCode, stderr } = runDepCruise([
        "packages/langgraph-graphs/src/graphs",
        "packages/ai-core/src",
      ]);
      if (exitCode !== 0) {
        // If there's an error, check if it's our expected rule violation
        // vs. some other issue
        console.error("STDERR:", stderr);
      }
      expect(exitCode).toBe(0);
    });

    it("runtime/ layer CAN import from @cogni/ai-core", () => {
      // Runtime layer is allowed to compose tool execution
      const { exitCode, stderr } = runDepCruise([
        "packages/langgraph-graphs/src/runtime",
        "packages/ai-core/src",
      ]);
      if (exitCode !== 0) {
        console.error("STDERR:", stderr);
      }
      expect(exitCode).toBe(0);
    });
  });
});
