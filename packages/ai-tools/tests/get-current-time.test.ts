// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/ai-tools/tests/get-current-time`
 * Purpose: Unit tests for get_current_time tool contract and implementation.
 * Scope: Tests contract shape, input validation, output validation, and execution; does not make network calls.
 * Invariants: No network/LLM calls; time is mocked for deterministic tests.
 * Side-effects: none
 * Links: src/tools/get-current-time.ts
 * @internal
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  GET_CURRENT_TIME_NAME,
  GetCurrentTimeInputSchema,
  GetCurrentTimeOutputSchema,
  getCurrentTimeBoundTool,
  getCurrentTimeContract,
  getCurrentTimeImplementation,
} from "../src/tools/get-current-time";

describe("get_current_time contract", () => {
  it("has correct name", () => {
    expect(getCurrentTimeContract.name).toBe("get_current_time");
    expect(GET_CURRENT_TIME_NAME).toBe("get_current_time");
  });

  it("has description for LLM", () => {
    expect(getCurrentTimeContract.description).toBeDefined();
    expect(getCurrentTimeContract.description.length).toBeGreaterThan(10);
  });

  it("has non-empty allowlist", () => {
    expect(getCurrentTimeContract.allowlist).toContain("currentTime");
    expect(getCurrentTimeContract.allowlist.length).toBeGreaterThan(0);
  });

  describe("inputSchema", () => {
    it("accepts empty object", () => {
      const result = getCurrentTimeContract.inputSchema.parse({});
      expect(result).toEqual({});
    });

    it("rejects undefined", () => {
      expect(() =>
        getCurrentTimeContract.inputSchema.parse(undefined)
      ).toThrow();
    });

    it("rejects null", () => {
      expect(() => getCurrentTimeContract.inputSchema.parse(null)).toThrow();
    });

    it("rejects extra properties (strict mode)", () => {
      expect(() =>
        getCurrentTimeContract.inputSchema.parse({ extra: "field" })
      ).toThrow();
    });
  });

  describe("outputSchema", () => {
    it("accepts valid ISO timestamp", () => {
      const result = getCurrentTimeContract.outputSchema.parse({
        currentTime: "2025-01-03T12:00:00.000Z",
      });
      expect(result.currentTime).toBe("2025-01-03T12:00:00.000Z");
    });

    it("rejects missing currentTime", () => {
      expect(() => getCurrentTimeContract.outputSchema.parse({})).toThrow();
    });

    it("rejects non-string currentTime", () => {
      expect(() =>
        getCurrentTimeContract.outputSchema.parse({ currentTime: 12345 })
      ).toThrow();
    });
  });

  describe("redact", () => {
    it("returns currentTime (no sensitive data)", () => {
      const output = { currentTime: "2025-01-03T12:00:00.000Z" };
      const redacted = getCurrentTimeContract.redact(output);
      expect(redacted).toEqual({ currentTime: "2025-01-03T12:00:00.000Z" });
    });
  });
});

describe("get_current_time implementation", () => {
  const MOCK_DATE = new Date("2025-01-03T15:30:00.000Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MOCK_DATE);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns ISO 8601 timestamp", async () => {
    const result = await getCurrentTimeImplementation.execute({});
    expect(result.currentTime).toBe("2025-01-03T15:30:00.000Z");
  });

  it("output passes validation", async () => {
    const result = await getCurrentTimeImplementation.execute({});
    expect(() =>
      getCurrentTimeContract.outputSchema.parse(result)
    ).not.toThrow();
  });
});

describe("get_current_time bound tool", () => {
  it("has both contract and implementation", () => {
    expect(getCurrentTimeBoundTool.contract).toBe(getCurrentTimeContract);
    expect(getCurrentTimeBoundTool.implementation).toBe(
      getCurrentTimeImplementation
    );
  });
});

describe("Zod schemas", () => {
  it("GetCurrentTimeInputSchema parses empty object", () => {
    expect(GetCurrentTimeInputSchema.parse({})).toEqual({});
  });

  it("GetCurrentTimeOutputSchema parses valid output", () => {
    const result = GetCurrentTimeOutputSchema.parse({
      currentTime: "2025-01-03T12:00:00.000Z",
    });
    expect(result.currentTime).toBe("2025-01-03T12:00:00.000Z");
  });
});
