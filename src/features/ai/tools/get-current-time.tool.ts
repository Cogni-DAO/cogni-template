// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/ai/tools/get-current-time`
 * Purpose: Simple tool that returns the current UTC time.
 * Scope: First tool for testing agentic loop. Does not have IO dependencies (pure).
 * Invariants:
 *   - Pure function, no side effects
 *   - Returns ISO 8601 format timestamp
 *   - No sensitive data (full output in allowlist)
 * Side-effects: none
 * Notes: Per TOOL_USE_SPEC.md P0 first tool requirement
 * Links: tool-registry.ts, tool-runner.ts, TOOL_USE_SPEC.md
 * @public
 */

import { z } from "zod";

import type { JsonSchemaObject, LlmToolDefinition } from "@/ports";

import type { BoundTool, ToolContract, ToolImplementation } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Input schema: empty object (tool takes no parameters)
 */
export const GetCurrentTimeInputSchema = z.object({}).strict();
export type GetCurrentTimeInput = z.infer<typeof GetCurrentTimeInputSchema>;

/**
 * Output schema: ISO 8601 timestamp
 */
export const GetCurrentTimeOutputSchema = z.object({
  currentTime: z.string().describe("Current UTC time in ISO 8601 format"),
});
export type GetCurrentTimeOutput = z.infer<typeof GetCurrentTimeOutputSchema>;

/**
 * Redacted output (same as output - no sensitive data)
 */
export type GetCurrentTimeRedacted = GetCurrentTimeOutput;

// ─────────────────────────────────────────────────────────────────────────────
// Contract
// ─────────────────────────────────────────────────────────────────────────────

export const GET_CURRENT_TIME_NAME = "get_current_time" as const;

export const getCurrentTimeContract: ToolContract<
  typeof GET_CURRENT_TIME_NAME,
  GetCurrentTimeInput,
  GetCurrentTimeOutput,
  GetCurrentTimeRedacted
> = {
  name: GET_CURRENT_TIME_NAME,

  validateInput: (input: unknown): GetCurrentTimeInput => {
    // Accept empty object or undefined/null (no required params)
    if (input === undefined || input === null) {
      return {};
    }
    return GetCurrentTimeInputSchema.parse(input);
  },

  validateOutput: (output: unknown): GetCurrentTimeOutput => {
    return GetCurrentTimeOutputSchema.parse(output);
  },

  redact: (output: GetCurrentTimeOutput): GetCurrentTimeRedacted => {
    // No sensitive data - return full output
    return { currentTime: output.currentTime };
  },

  allowlist: ["currentTime"] as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

export const getCurrentTimeImplementation: ToolImplementation<
  GetCurrentTimeInput,
  GetCurrentTimeOutput
> = {
  execute: async (
    _input: GetCurrentTimeInput
  ): Promise<GetCurrentTimeOutput> => {
    return {
      currentTime: new Date().toISOString(),
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Bound Tool (contract + implementation)
// ─────────────────────────────────────────────────────────────────────────────

export const getCurrentTimeBoundTool: BoundTool<
  typeof GET_CURRENT_TIME_NAME,
  GetCurrentTimeInput,
  GetCurrentTimeOutput,
  GetCurrentTimeRedacted
> = {
  contract: getCurrentTimeContract,
  implementation: getCurrentTimeImplementation,
};

// ─────────────────────────────────────────────────────────────────────────────
// LLM Tool Definition (OpenAI-compatible format)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * JSON Schema for tool parameters (OpenAI function-calling format)
 */
export const getCurrentTimeJsonSchema: JsonSchemaObject = {
  type: "object",
  properties: {},
  required: [],
  additionalProperties: false,
};

/**
 * LLM tool definition for get_current_time
 */
export const getCurrentTimeLlmDefinition: LlmToolDefinition = {
  type: "function",
  function: {
    name: GET_CURRENT_TIME_NAME,
    description:
      "Get the current UTC time. Returns the time in ISO 8601 format.",
    parameters: getCurrentTimeJsonSchema,
  },
};
