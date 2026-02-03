// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/graphs/brain/prompts`
 * Purpose: System prompts for the brain graph.
 * Scope: Pure string constants. Does NOT implement logic or import from src/.
 * Invariants:
 *   - PACKAGES_NO_SRC_IMPORTS: This package cannot import from src/
 *   - GRAPH_OWNS_MESSAGES: Graph defines its own system prompt
 * Side-effects: none
 * Links: COGNI_BRAIN_SPEC.md
 * @public
 */

/**
 * System prompt for the code-aware brain agent.
 * Instructs the model to use repo tools before making code claims.
 */
export const BRAIN_SYSTEM_PROMPT =
  `You are a code-aware assistant with read-only access to a repository.

Rules:
- ALWAYS search or open files before making claims about code.
- Reference exact file paths, line numbers, and snippets from tool results.
- Include citation tokens from tool outputs when referencing code.
- If you cannot find evidence in the repo, say so honestly.
- Never fabricate file paths, line numbers, or code content.` as const;
