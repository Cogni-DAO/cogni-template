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
  RepoCapability,
  RepoOpenParams,
  RepoOpenResult,
  RepoSearchHit,
  RepoSearchParams,
  RepoSearchResult,
  TemplateQueryParams,
  ToolCapabilities,
  WebSearchCapability,
  WebSearchParams,
  WebSearchResult,
  // Note: WebSearchResultItem exported from tools/web-search to avoid duplicate
  WebSearchTopic,
} from "./capabilities";
// Capabilities
export {
  createFixedClock,
  makeRepoCitation,
  REPO_CITATION_REGEX,
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
export {
  createRepoOpenImplementation,
  REPO_OPEN_NAME,
  type RepoOpenDeps,
  type RepoOpenInput,
  RepoOpenInputSchema,
  type RepoOpenOutput,
  RepoOpenOutputSchema,
  type RepoOpenRedacted,
  repoOpenBoundTool,
  repoOpenContract,
  repoOpenStubImplementation,
} from "./tools/repo-open";
export {
  createRepoSearchImplementation,
  REPO_SEARCH_NAME,
  type RepoSearchDeps,
  type RepoSearchHitOutput,
  RepoSearchHitSchema,
  type RepoSearchInput,
  RepoSearchInputSchema,
  type RepoSearchOutput,
  RepoSearchOutputSchema,
  type RepoSearchRedacted,
  repoSearchBoundTool,
  repoSearchContract,
  repoSearchStubImplementation,
} from "./tools/repo-search";
export {
  createWebSearchImplementation,
  WEB_SEARCH_NAME,
  type WebSearchDeps,
  type WebSearchInput,
  WebSearchInputSchema,
  type WebSearchOutput,
  WebSearchOutputSchema,
  type WebSearchRedacted,
  type WebSearchResultItem,
  WebSearchResultItemSchema,
  webSearchBoundTool,
  webSearchContract,
  webSearchStubImplementation,
} from "./tools/web-search";
// Tool types
export type {
  BoundTool,
  ToolContract,
  ToolErrorCode,
  ToolImplementation,
  ToolResult,
} from "./types";
