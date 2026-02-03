// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/ai-tools/tools/repo-list`
 * Purpose: AI tool for listing repository files by name/glob pattern.
 * Scope: File discovery with structured results. Does NOT implement transport.
 * Invariants:
 *   - TOOL_ID_NAMESPACED: ID is `core__repo_list` (double-underscore for provider compat)
 *   - EFFECT_TYPED: effect is `read_only` (read-only repo access)
 *   - REDACTION_REQUIRED: Allowlist in contract
 *   - SHA_STAMPED: All results include HEAD sha7
 *   - HARD_BOUNDS: max 5000 paths per request
 *   - NO LangChain imports (LangChain wrapping in langgraph-graphs)
 * Side-effects: IO (file system access via capability)
 * Notes: Requires RepoCapability to be configured
 * Links: COGNI_BRAIN_SPEC.md, TOOL_USE_SPEC.md
 * @public
 */

import { z } from "zod";

import type { RepoCapability } from "../capabilities/repo";
import type { BoundTool, ToolContract, ToolImplementation } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Input schema for repo list tool.
 */
export const RepoListInputSchema = z.object({
  glob: z
    .string()
    .max(200)
    .optional()
    .describe(
      "Optional glob pattern to filter files (git pathspec rules, e.g., 'LICENSE*', 'src/**/*.ts')"
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(5000)
    .optional()
    .describe("Maximum number of file paths to return (1-5000, default 2000)"),
});
export type RepoListInput = z.infer<typeof RepoListInputSchema>;

/**
 * Output schema for repo list tool.
 */
export const RepoListOutputSchema = z.object({
  paths: z
    .array(z.string())
    .describe("File paths relative to repo root (no leading ./)"),
  sha: z.string().length(7).describe("HEAD sha (7 chars)"),
  truncated: z
    .boolean()
    .describe("True if results were truncated at the limit"),
});
export type RepoListOutput = z.infer<typeof RepoListOutputSchema>;

/**
 * Redacted output (same as output - file paths are not sensitive in this context).
 */
export type RepoListRedacted = RepoListOutput;

// ─────────────────────────────────────────────────────────────────────────────
// Contract
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Namespaced tool ID per TOOL_ID_NAMESPACED invariant.
 */
export const REPO_LIST_NAME = "core__repo_list" as const;

export const repoListContract: ToolContract<
  typeof REPO_LIST_NAME,
  RepoListInput,
  RepoListOutput,
  RepoListRedacted
> = {
  name: REPO_LIST_NAME,
  description:
    "List files in the repository, optionally filtered by a glob pattern (git pathspec rules). " +
    "Use for discovering files by name, checking if a file exists, or browsing directory structure. " +
    "Returns file paths relative to repo root. The glob is passed to `git ls-files` and follows " +
    "git pathspec conventions (not bash or minimatch). Default limit is 2000 paths.",
  effect: "read_only",
  inputSchema: RepoListInputSchema,
  outputSchema: RepoListOutputSchema,

  redact: (output: RepoListOutput): RepoListRedacted => {
    return output;
  },

  allowlist: ["paths", "sha", "truncated"] as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dependencies for repo list implementation.
 */
export interface RepoListDeps {
  repoCapability: RepoCapability;
}

/**
 * Create repo list implementation with injected dependencies.
 */
export function createRepoListImplementation(
  deps: RepoListDeps
): ToolImplementation<RepoListInput, RepoListOutput> {
  return {
    execute: async (input: RepoListInput): Promise<RepoListOutput> => {
      return deps.repoCapability.list({
        glob: input.glob,
        limit: input.limit,
      });
    },
  };
}

/**
 * Stub implementation that throws when repo capability is not configured.
 */
export const repoListStubImplementation: ToolImplementation<
  RepoListInput,
  RepoListOutput
> = {
  execute: async (): Promise<RepoListOutput> => {
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
 * Real implementation injected at runtime via createRepoListImplementation.
 */
export const repoListBoundTool: BoundTool<
  typeof REPO_LIST_NAME,
  RepoListInput,
  RepoListOutput,
  RepoListRedacted
> = {
  contract: repoListContract,
  implementation: repoListStubImplementation,
};
