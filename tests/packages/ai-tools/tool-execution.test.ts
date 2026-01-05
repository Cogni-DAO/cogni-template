// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/packages/ai-tools/tool-execution`
 * Purpose: Integration test verifying ai-tools can be executed through runtime wrapper.
 * Scope: Tests tool execution flow: validate → execute → validate output → redact; does not make LLM calls.
 * Invariants: No network/LLM calls; exercises the full tool lifecycle.
 * Side-effects: none
 * Links: packages/ai-tools, src/features/ai/tool-runner.ts
 * @internal
 */

import {
  type BoundTool,
  GET_CURRENT_TIME_NAME,
  getCurrentTimeBoundTool,
} from "@cogni/ai-tools";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Minimal tool executor that mirrors the tool-runner pattern.
 * This tests that ai-tools types and implementations work with the runtime.
 */
async function executeToolWithValidation<
  TName extends string,
  TInput,
  TOutput,
  TRedacted,
>(
  tool: BoundTool<TName, TInput, TOutput, TRedacted>,
  rawArgs: unknown
): Promise<{ ok: true; value: TRedacted } | { ok: false; error: string }> {
  const { contract, implementation } = tool;

  // 1. Validate input via Zod schema
  let validatedInput: TInput;
  try {
    validatedInput = contract.inputSchema.parse(rawArgs) as TInput;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Invalid input",
    };
  }

  // 2. Execute
  let rawOutput: TOutput;
  try {
    rawOutput = await implementation.execute(validatedInput);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Execution failed",
    };
  }

  // 3. Validate output via Zod schema
  let validatedOutput: TOutput;
  try {
    validatedOutput = contract.outputSchema.parse(rawOutput) as TOutput;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Invalid output",
    };
  }

  // 4. Redact
  const redacted = contract.redact(validatedOutput);

  return { ok: true, value: redacted };
}

describe("ai-tools integration: tool execution lifecycle", () => {
  const MOCK_DATE = new Date("2025-01-03T15:30:00.000Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MOCK_DATE);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("executes get_current_time through full lifecycle", async () => {
    const result = await executeToolWithValidation(getCurrentTimeBoundTool, {});

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        currentTime: "2025-01-03T15:30:00.000Z",
      });
    }
  });

  it("rejects null/undefined args (Zod strict validation)", async () => {
    const resultNull = await executeToolWithValidation(
      getCurrentTimeBoundTool,
      null
    );
    expect(resultNull.ok).toBe(false);

    const resultUndefined = await executeToolWithValidation(
      getCurrentTimeBoundTool,
      undefined
    );
    expect(resultUndefined.ok).toBe(false);
  });

  it("returns error for invalid input", async () => {
    const result = await executeToolWithValidation(getCurrentTimeBoundTool, {
      invalidField: "value",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Unrecognized key");
    }
  });

  it("tool name matches expected constant", () => {
    expect(getCurrentTimeBoundTool.contract.name).toBe(GET_CURRENT_TIME_NAME);
    expect(GET_CURRENT_TIME_NAME).toBe("get_current_time");
  });

  it("allowlist is enforced in redacted output", async () => {
    const result = await executeToolWithValidation(getCurrentTimeBoundTool, {});

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Only allowlisted fields should appear
      const keys = Object.keys(result.value as object);
      const allowlist = getCurrentTimeBoundTool.contract
        .allowlist as readonly string[];
      for (const key of keys) {
        expect(allowlist).toContain(key);
      }
    }
  });
});
