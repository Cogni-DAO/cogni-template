// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/ai-tools/tools/repo-open`
 * Purpose: AI tool for opening repository files with line ranges.
 * Scope: File retrieval with structured results and citations. Does NOT implement transport.
 * Invariants:
 *   - TOOL_ID_NAMESPACED: ID is `core__repo_open` (double-underscore for provider compat)
 *   - EFFECT_TYPED: effect is `read_only` (read-only repo access)
 *   - REDACTION_REQUIRED: Allowlist in contract
 *   - SHA_STAMPED: All results include HEAD sha7
 *   - HARD_BOUNDS: max 200 lines, max 256KB file size
 *   - REPO_ROOT_ONLY: Rejects .. paths and symlink escapes
 *   - NO LangChain imports (LangChain wrapping in langgraph-graphs)
 * Side-effects: IO (file system access via capability)
 * Notes: Requires RepoCapability to be configured
 * Links: COGNI_BRAIN_SPEC.md, TOOL_USE_SPEC.md
 * @public
 */

import { z } from "zod";

import type { RepoCapability } from "../capabilities/repo";
import { makeRepoCitation } from "../capabilities/repo";
import type { BoundTool, ToolContract, ToolImplementation } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Input schema for repo open tool.
 */
export const RepoOpenInputSchema = z.object({
  path: z
    .string()
    .min(1)
    .max(500)
    .describe("File path relative to repository root"),
  lineStart: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Starting line number (1-indexed, default 1)"),
  lineEnd: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Ending line number (1-indexed, default lineStart + 199)"),
});
export type RepoOpenInput = z.infer<typeof RepoOpenInputSchema>;

/**
 * Output schema for repo open tool.
 */
export const RepoOpenOutputSchema = z.object({
  repoId: z.string().describe("Repository identifier (e.g., 'main')"),
  path: z.string().describe("File path relative to repo root"),
  sha: z.string().length(7).describe("HEAD sha (7 chars)"),
  lineStart: z.number().int().describe("Starting line number (1-indexed)"),
  lineEnd: z.number().int().describe("Ending line number (1-indexed)"),
  content: z.string().describe("File content (max 200 lines)"),
  citation: z.string().describe("Citation token for referencing this content"),
});
export type RepoOpenOutput = z.infer<typeof RepoOpenOutputSchema>;

/**
 * Redacted output (same as output - file content is not sensitive in this context).
 */
export type RepoOpenRedacted = RepoOpenOutput;

// ─────────────────────────────────────────────────────────────────────────────
// Contract
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Namespaced tool ID per TOOL_ID_NAMESPACED invariant.
 */
export const REPO_OPEN_NAME = "core__repo_open" as const;

export const repoOpenContract: ToolContract<
  typeof REPO_OPEN_NAME,
  RepoOpenInput,
  RepoOpenOutput,
  RepoOpenRedacted
> = {
  name: REPO_OPEN_NAME,
  description:
    "Open a file from the repository and retrieve its content. Returns file content with " +
    "line numbers and a citation token. Use for reading specific files, viewing function " +
    "implementations, or examining configuration. Max 200 lines per request. The result " +
    "includes a citation token that MUST be included when referencing the content in responses.",
  effect: "read_only",
  inputSchema: RepoOpenInputSchema,
  outputSchema: RepoOpenOutputSchema,

  redact: (output: RepoOpenOutput): RepoOpenRedacted => {
    // No sensitive data - return full output
    return output;
  },

  allowlist: [
    "repoId",
    "path",
    "sha",
    "lineStart",
    "lineEnd",
    "content",
    "citation",
  ] as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dependencies for repo open implementation.
 */
export interface RepoOpenDeps {
  repoCapability: RepoCapability;
}

/**
 * Create repo open implementation with injected dependencies.
 */
export function createRepoOpenImplementation(
  deps: RepoOpenDeps
): ToolImplementation<RepoOpenInput, RepoOpenOutput> {
  return {
    execute: async (input: RepoOpenInput): Promise<RepoOpenOutput> => {
      const result = await deps.repoCapability.open({
        path: input.path,
        lineStart: input.lineStart,
        lineEnd: input.lineEnd,
      });

      return {
        ...result,
        citation: makeRepoCitation(result),
      };
    },
  };
}

/**
 * Stub implementation that throws when repo capability is not configured.
 */
export const repoOpenStubImplementation: ToolImplementation<
  RepoOpenInput,
  RepoOpenOutput
> = {
  execute: async (): Promise<RepoOpenOutput> => {
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
 * Real implementation injected at runtime via createRepoOpenImplementation.
 */
export const repoOpenBoundTool: BoundTool<
  typeof REPO_OPEN_NAME,
  RepoOpenInput,
  RepoOpenOutput,
  RepoOpenRedacted
> = {
  contract: repoOpenContract,
  implementation: repoOpenStubImplementation,
};
