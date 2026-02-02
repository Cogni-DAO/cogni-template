// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/graphs/research/state`
 * Purpose: State schema for research graph with files for report management.
 * Scope: Defines ResearchStateAnnotation for supervisor + report coordination. Does NOT execute graph logic.
 * Invariants:
 *   - STATE_EXTENDS_MESSAGES: Includes MessagesAnnotation.spec
 *   - FILES_ARE_VIRTUAL: files record simulates filesystem for report writing
 * Side-effects: none
 * Links: LANGGRAPH_AI.md
 * @public
 */

import { Annotation, MessagesAnnotation } from "@langchain/langgraph";

/**
 * Research graph state annotation.
 *
 * Extends MessagesAnnotation with:
 * - files: Virtual filesystem for reports (question.txt, final_report.md)
 */
export const ResearchStateAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,

  /**
   * Virtual filesystem for research artifacts.
   * Key = filename, Value = file contents.
   * Used for question.txt and final_report.md.
   * Reducer: merge (shallow object merge).
   */
  files: Annotation<Record<string, string>>({
    reducer: (left, right) => ({ ...(left ?? {}), ...(right ?? {}) }),
    default: () => ({}),
  }),
});

/**
 * Type for research state.
 */
export type ResearchState = typeof ResearchStateAnnotation.State;
