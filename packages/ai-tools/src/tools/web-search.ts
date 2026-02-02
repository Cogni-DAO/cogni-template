// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/ai-tools/tools/web-search`
 * Purpose: AI tool for searching the web using Tavily API.
 * Scope: Web search with structured results. Does NOT implement transport.
 * Invariants:
 *   - TOOL_ID_NAMESPACED: ID is `core__web_search` (double-underscore for provider compat)
 *   - EFFECT_TYPED: effect is `read_only` (external API but no mutations)
 *   - REDACTION_REQUIRED: Allowlist in contract
 *   - NO LangChain imports (LangChain wrapping in langgraph-graphs)
 * Side-effects: IO (HTTP requests to web search backend via capability)
 * Notes: Requires WebSearchCapability to be configured (TAVILY_API_KEY)
 * Links: TOOL_USE_SPEC.md
 * @public
 */

import { z } from "zod";

import type { WebSearchCapability } from "../capabilities/web-search";
import type { BoundTool, ToolContract, ToolImplementation } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Input schema for web search tool.
 */
export const WebSearchInputSchema = z.object({
  query: z.string().min(1).max(400).describe("The search query"),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe("Maximum number of results to return (1-20, default 5)"),
  topic: z
    .enum(["general", "news", "finance"])
    .optional()
    .describe("Search topic: general (default), news (real-time), or finance"),
  includeRawContent: z
    .boolean()
    .optional()
    .describe("Include raw page content in results (default: false)"),
});
export type WebSearchInput = z.infer<typeof WebSearchInputSchema>;

/**
 * Single search result schema.
 */
export const WebSearchResultItemSchema = z.object({
  title: z.string().describe("Title of the search result"),
  url: z.string().describe("URL of the search result"),
  content: z.string().describe("Snippet or content from the result"),
  score: z.number().optional().describe("Relevance score (if available)"),
  rawContent: z.string().optional().describe("Raw page content (if requested)"),
});
export type WebSearchResultItem = z.infer<typeof WebSearchResultItemSchema>;

/**
 * Output schema for web search tool.
 */
export const WebSearchOutputSchema = z.object({
  query: z.string().describe("The original query"),
  results: z.array(WebSearchResultItemSchema).describe("Search results"),
});
export type WebSearchOutput = z.infer<typeof WebSearchOutputSchema>;

/**
 * Redacted output (same as output - search results are not sensitive).
 * Per REDACTION_REQUIRED: Allowlist in contract.
 */
export type WebSearchRedacted = WebSearchOutput;

// ─────────────────────────────────────────────────────────────────────────────
// Contract
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Namespaced tool ID per TOOL_ID_NAMESPACED invariant.
 * Uses double-underscore separator (provider-compatible: OpenAI allows [a-zA-Z0-9_-]+)
 */
export const WEB_SEARCH_NAME = "core__web_search" as const;

export const webSearchContract: ToolContract<
  typeof WEB_SEARCH_NAME,
  WebSearchInput,
  WebSearchOutput,
  WebSearchRedacted
> = {
  name: WEB_SEARCH_NAME,
  description:
    "Search the web for information. Returns relevant search results with titles, URLs, " +
    "and content snippets. Use for finding current information, research, and fact-checking.",
  effect: "read_only",
  inputSchema: WebSearchInputSchema,
  outputSchema: WebSearchOutputSchema,

  redact: (output: WebSearchOutput): WebSearchRedacted => {
    // No sensitive data - return full output
    return output;
  },

  allowlist: ["query", "results"] as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dependencies for web search implementation.
 * Per AUTH_VIA_CAPABILITY_INTERFACE: Auth resolved via capability.
 */
export interface WebSearchDeps {
  webSearchCapability: WebSearchCapability;
}

/**
 * Create web search implementation with injected dependencies.
 * Per capability pattern: implementation receives capability at construction.
 */
export function createWebSearchImplementation(
  deps: WebSearchDeps
): ToolImplementation<WebSearchInput, WebSearchOutput> {
  return {
    execute: async (input: WebSearchInput): Promise<WebSearchOutput> => {
      const result = await deps.webSearchCapability.search({
        query: input.query,
        maxResults: input.maxResults,
        topic: input.topic,
        includeRawContent: input.includeRawContent,
      });

      return {
        query: result.query,
        results: result.results.map((r) => ({
          title: r.title,
          url: r.url,
          content: r.content,
          score: r.score,
          rawContent: r.rawContent,
        })),
      };
    },
  };
}

/**
 * Stub implementation that throws when web search capability is not configured.
 * Used as default placeholder in catalog.
 */
export const webSearchStubImplementation: ToolImplementation<
  WebSearchInput,
  WebSearchOutput
> = {
  execute: async (): Promise<WebSearchOutput> => {
    throw new Error(
      "WebSearchCapability not configured. Set TAVILY_API_KEY environment variable."
    );
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Bound Tool (contract + stub implementation)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bound tool with stub implementation.
 * Real implementation injected at runtime via createWebSearchImplementation.
 */
export const webSearchBoundTool: BoundTool<
  typeof WEB_SEARCH_NAME,
  WebSearchInput,
  WebSearchOutput,
  WebSearchRedacted
> = {
  contract: webSearchContract,
  implementation: webSearchStubImplementation,
};
