// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/ai-tools/tools/repo-search`
 * Purpose: AI tool for searching repository code using ripgrep.
 * Scope: Code search with structured results and citations. Does NOT implement transport.
 * Invariants:
 *   - TOOL_ID_NAMESPACED: ID is `core__repo_search` (double-underscore for provider compat)
 *   - EFFECT_TYPED: effect is `read_only` (read-only repo access)
 *   - REDACTION_REQUIRED: Allowlist in contract
 *   - SHA_STAMPED: All results include HEAD sha7
 *   - HARD_BOUNDS: max 50 hits, max 20 lines per snippet
 *   - NO LangChain imports (LangChain wrapping in langgraph-graphs)
 * Side-effects: IO (file system access via capability)
 * Notes: Requires RepoCapability to be configured
 * Links: COGNI_BRAIN_SPEC.md, TOOL_USE_SPEC.md
 * @public
 */

import { z } from "zod";

import type { RepoCapability, RepoSearchHit } from "../capabilities/repo";
import { makeRepoCitation } from "../capabilities/repo";
import type { BoundTool, ToolContract, ToolImplementation } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Input schema for repo search tool.
 */
export const RepoSearchInputSchema = z.object({
  query: z
    .string()
    .min(1)
    .max(500)
    .describe("Search query (supports regex patterns)"),
  glob: z
    .string()
    .max(100)
    .optional()
    .describe(
      "Optional glob pattern to filter files (e.g., '*.ts', 'src/**/*.tsx')"
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Maximum number of results to return (1-50, default 10)"),
});
export type RepoSearchInput = z.infer<typeof RepoSearchInputSchema>;

/**
 * Single search hit schema.
 */
export const RepoSearchHitSchema = z.object({
  repoId: z.string().describe("Repository identifier (e.g., 'main')"),
  path: z.string().describe("File path relative to repo root"),
  lineStart: z.number().int().describe("Starting line number (1-indexed)"),
  lineEnd: z.number().int().describe("Ending line number (1-indexed)"),
  snippet: z.string().describe("Code snippet (max 20 lines)"),
  sha: z.string().length(7).describe("HEAD sha (7 chars)"),
  citation: z.string().describe("Citation token for referencing this result"),
});
export type RepoSearchHitOutput = z.infer<typeof RepoSearchHitSchema>;

/**
 * Output schema for repo search tool.
 */
export const RepoSearchOutputSchema = z.object({
  query: z.string().describe("The original query"),
  hits: z.array(RepoSearchHitSchema).describe("Search results with citations"),
});
export type RepoSearchOutput = z.infer<typeof RepoSearchOutputSchema>;

/**
 * Redacted output (same as output - search results are not sensitive).
 */
export type RepoSearchRedacted = RepoSearchOutput;

// ─────────────────────────────────────────────────────────────────────────────
// Contract
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Namespaced tool ID per TOOL_ID_NAMESPACED invariant.
 */
export const REPO_SEARCH_NAME = "core__repo_search" as const;

export const repoSearchContract: ToolContract<
  typeof REPO_SEARCH_NAME,
  RepoSearchInput,
  RepoSearchOutput,
  RepoSearchRedacted
> = {
  name: REPO_SEARCH_NAME,
  description:
    "Search the repository for code matching a query. Returns file paths, line numbers, " +
    "code snippets, and citation tokens. Use for finding code patterns, function definitions, " +
    "and understanding codebase structure. Each result includes a citation token that MUST be " +
    "included when referencing the code in responses.",
  effect: "read_only",
  inputSchema: RepoSearchInputSchema,
  outputSchema: RepoSearchOutputSchema,

  redact: (output: RepoSearchOutput): RepoSearchRedacted => {
    // No sensitive data - return full output
    return output;
  },

  allowlist: ["query", "hits"] as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dependencies for repo search implementation.
 */
export interface RepoSearchDeps {
  repoCapability: RepoCapability;
}

/**
 * Transform capability hit to tool output hit with citation.
 */
function hitWithCitation(hit: RepoSearchHit): RepoSearchHitOutput {
  return {
    ...hit,
    citation: makeRepoCitation(hit),
  };
}

/**
 * Create repo search implementation with injected dependencies.
 */
export function createRepoSearchImplementation(
  deps: RepoSearchDeps
): ToolImplementation<RepoSearchInput, RepoSearchOutput> {
  return {
    execute: async (input: RepoSearchInput): Promise<RepoSearchOutput> => {
      const result = await deps.repoCapability.search({
        query: input.query,
        glob: input.glob,
        limit: input.limit,
      });

      return {
        query: result.query,
        hits: result.hits.map(hitWithCitation),
      };
    },
  };
}

/**
 * Stub implementation that throws when repo capability is not configured.
 */
export const repoSearchStubImplementation: ToolImplementation<
  RepoSearchInput,
  RepoSearchOutput
> = {
  execute: async (): Promise<RepoSearchOutput> => {
    throw new Error(
      "RepoCapability not configured. Repository access not available."
    );
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Bound Tool (contract + stub implementation)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bound tool with stub implementation.
 * Real implementation injected at runtime via createRepoSearchImplementation.
 */
export const repoSearchBoundTool: BoundTool<
  typeof REPO_SEARCH_NAME,
  RepoSearchInput,
  RepoSearchOutput,
  RepoSearchRedacted
> = {
  contract: repoSearchContract,
  implementation: repoSearchStubImplementation,
};
