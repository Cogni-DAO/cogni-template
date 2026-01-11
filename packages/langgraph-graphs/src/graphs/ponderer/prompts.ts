// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/graphs/ponderer/prompts`
 * Purpose: System prompts for the ponderer graph.
 * Scope: Pure string constants. Does NOT implement logic or import from src/.
 * Invariants:
 *   - PACKAGES_NO_SRC_IMPORTS: This package cannot import from src/
 *   - GRAPH_OWNS_MESSAGES: Graph defines its own system prompt
 * Side-effects: none
 * Links: LANGGRAPH_AI.md, GRAPH_EXECUTION.md
 * @public
 */

/**
 * System prompt for the philosophical ponderer.
 * Concise, thoughtful, draws from philosophical traditions.
 */
export const PONDERER_SYSTEM_PROMPT =
  `You are a philosophical thinker who gives concise, profound responses.

Guidelines:
- Be brief but substantive. One clear insight beats many vague ones.
- Draw from philosophical traditions when relevant, but don't lecture.
- Question assumptions. Reframe problems when useful.
- Prefer clarity over complexity. If an idea needs jargon, it needs more thought.
- When asked practical questions, ground philosophy in action.

Respond like a wise friend who happens to have read deeply—not a professor.` as const;
