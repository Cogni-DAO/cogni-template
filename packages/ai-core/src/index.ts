// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/ai-core`
 * Purpose: Barrel export for executor-agnostic AI primitives.
 * Scope: Re-exports all public types from submodules. Does NOT implement logic.
 * Invariants: SINGLE_SOURCE_OF_TRUTH - these are the canonical definitions.
 * Side-effects: none
 * Links: LANGGRAPH_SERVER.md, GRAPH_EXECUTION.md
 * @public
 */

// Billing types
export { SOURCE_SYSTEMS, type SourceSystem } from "./billing/source-system";
// Context types
export type { RunContext } from "./context/run-context";
// Event types
export type {
  AiEvent,
  AssistantFinalEvent,
  DoneEvent,
  ErrorEvent,
  TextDeltaEvent,
  ToolCallResultEvent,
  ToolCallStartEvent,
  UsageReportEvent,
} from "./events/ai-events";
// Execution types and utilities
export {
  AI_EXECUTION_ERROR_CODES,
  AiExecutionError,
  type AiExecutionErrorCode,
  isAiExecutionError,
  isAiExecutionErrorCode,
  normalizeErrorToExecutionCode,
} from "./execution/error-codes";
// LLM error types (thrown by adapters, classified by normalizer)
export {
  classifyLlmErrorFromStatus,
  isLlmError,
  LlmError,
  type LlmErrorKind,
} from "./execution/llm-errors";
// Graph types
export type { GraphId } from "./graph/graph-id";
// Tooling types
export type {
  EmitAiEvent,
  RedactionMode,
  ToolEffect,
  ToolErrorCode,
  ToolExecFn,
  ToolExecResult,
  ToolInvocationRecord,
  ToolRedactionConfig,
  ToolSpec,
} from "./tooling/types";
// Usage types
export type { ExecutorType, UsageFact } from "./usage/usage";
