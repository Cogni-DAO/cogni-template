// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs`
 * Purpose: Barrel export for LangGraph graph definitions and runtime utilities.
 * Scope: Re-exports public types. All @langchain/* code lives here (per NO_LANGCHAIN_IN_SRC). Does not contain implementation logic.
 * Invariants:
 *   - SINGLE_SOURCE_OF_TRUTH: These are the canonical LangGraph definitions
 *   - NO_LANGCHAIN_IN_SRC: Only this package imports @langchain/*
 *   - PACKAGES_NO_SRC_IMPORTS: Never import from src/
 * Side-effects: none
 * Links: LANGGRAPH_AI.md, GRAPH_EXECUTION.md
 * @public
 */

// Re-export graph constants and factories
export { CHAT_GRAPH_NAME } from "./graphs/index";

// Re-export runtime types (interfaces only, not implementations)
export type { Message, ToLangChainToolOptions } from "./runtime/index";
