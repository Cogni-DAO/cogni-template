// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/ai-tools/capabilities/web-search`
 * Purpose: Web search capability interface for AI tool execution.
 * Scope: Defines WebSearchCapability for web search queries. Does NOT implement transport.
 * Invariants:
 *   - NO_SECRETS_IN_CONTEXT: Capability resolves auth, never stored in context
 *   - STRUCTURED_RESULTS: Returns typed search results with title, url, content
 * Side-effects: none (interface only)
 * Links: TOOL_USE_SPEC.md
 * @public
 */

/**
 * Search topic category.
 * Per Tavily API: "general" (default), "news" (real-time updates), "finance" (financial data).
 */
export type WebSearchTopic = "general" | "news" | "finance";

/**
 * Parameters for web search queries.
 */
export interface WebSearchParams {
  /** The search query */
  query: string;
  /** Maximum number of results (1-20) */
  maxResults?: number;
  /** Search topic category */
  topic?: WebSearchTopic;
  /** Include raw page content in results */
  includeRawContent?: boolean;
}

/**
 * Single search result.
 */
export interface WebSearchResultItem {
  /** Title of the search result */
  title: string;
  /** URL of the search result */
  url: string;
  /** Snippet or content from the result */
  content: string;
  /** Relevance score (if available) */
  score?: number;
  /** Raw page content (if requested) */
  rawContent?: string;
}

/**
 * Result from a web search query.
 */
export interface WebSearchResult {
  /** The original query */
  query: string;
  /** Search results */
  results: WebSearchResultItem[];
}

/**
 * Web search capability for AI tools.
 *
 * Per AUTH_VIA_CAPABILITY_INTERFACE:
 * Auth is resolved by the capability implementation, not passed in context.
 */
export interface WebSearchCapability {
  /**
   * Execute a web search query.
   *
   * @param params - Search parameters (query, maxResults, topic, includeRawContent)
   * @returns Search results with title, url, and content
   * @throws If search fails or API is unavailable
   */
  search(params: WebSearchParams): Promise<WebSearchResult>;
}
