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

export type {
  AuthCapability,
  ClockCapability,
  MetricDataPoint,
  MetricQueryResult,
  MetricSummary,
  MetricsCapability,
  MetricTemplate,
  MetricWindow,
  TemplateQueryParams,
  ToolCapabilities,
} from "./capabilities";
// Capabilities
export {
  createFixedClock,
  stubAuthCapability,
  systemClock,
} from "./capabilities";
// Tool catalog
export {
  type CatalogBoundTool,
  createToolCatalog,
  getToolById,
  getToolIds,
  hasToolId,
  TOOL_CATALOG,
  type ToolCatalog,
} from "./catalog";
// Runtime adapter
export { contractToRuntime, toBoundToolRuntime } from "./runtime-adapter";
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
export {
  createMetricsQueryImplementation,
  METRICS_QUERY_NAME,
  type MetricsDataPoint,
  MetricsDataPointSchema,
  type MetricsQueryDeps,
  type MetricsQueryInput,
  MetricsQueryInputSchema,
  type MetricsQueryOutput,
  MetricsQueryOutputSchema,
  type MetricsQueryRedacted,
  type MetricsSummary,
  MetricsSummarySchema,
  metricsQueryBoundTool,
  metricsQueryContract,
  metricsQueryStubImplementation,
} from "./tools/metrics-query";
// Tool types
export type {
  BoundTool,
  ToolContract,
  ToolErrorCode,
  ToolImplementation,
  ToolResult,
} from "./types";
