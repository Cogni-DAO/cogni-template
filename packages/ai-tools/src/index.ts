// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/ai-tools`
 * Purpose: Barrel export for pure tool definitions and contracts.
 * Scope: Re-exports all public types from submodules. Does NOT import @langchain.
 * Invariants: SINGLE_SOURCE_OF_TRUTH - these are the canonical tool definitions.
 * Side-effects: none
 * Links: LANGGRAPH_AI.md, TOOL_USE_SPEC.md
 * @public
 */

// Schema compilation
export {
  type ToToolSpecResult,
  type ToToolSpecsResult,
  toToolSpec,
  toToolSpecs,
} from "./schema";
// Tools
export {
  GET_CURRENT_TIME_NAME,
  type GetCurrentTimeInput,
  GetCurrentTimeInputSchema,
  type GetCurrentTimeOutput,
  GetCurrentTimeOutputSchema,
  type GetCurrentTimeRedacted,
  getCurrentTimeBoundTool,
  getCurrentTimeContract,
  getCurrentTimeImplementation,
} from "./tools/get-current-time";
// Tool types
export type {
  BoundTool,
  ToolContract,
  ToolErrorCode,
  ToolImplementation,
  ToolResult,
} from "./types";
