// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/graphs/research/state`
 * Purpose: State schemas for hierarchical research graph (main → supervisor → researcher).
 * Scope: Defines state annotations for each graph level. Does NOT execute graph logic.
 * Invariants:
 *   - HIERARCHICAL_STATE: Each subgraph level has its own state schema
 *   - STATE_EXTENDS_MESSAGES: All states include messages for conversation tracking
 *   - REDUCER_SEMANTICS: Explicit reducers for list accumulation vs override
 * Side-effects: none
 * Links: LANGGRAPH_AI.md, open-deep-research reference
 * @public
 */

import type { BaseMessage } from "@langchain/core/messages";
import { Annotation, MessagesAnnotation } from "@langchain/langgraph";

// ─────────────────────────────────────────────────────────────────────────────
// Reducers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Override reducer: allows replacing entire value via { type: "override", value: T }.
 * Otherwise appends to existing array.
 */
function overrideReducer<T>(
  current: T[],
  update: T[] | { type: "override"; value: T[] }
): T[] {
  if (
    update &&
    typeof update === "object" &&
    "type" in update &&
    update.type === "override"
  ) {
    return update.value;
  }
  return [...(current ?? []), ...(update as T[])];
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Graph State (outer level)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main research graph state.
 *
 * This is the outermost state containing:
 * - messages: User conversation (input/output)
 * - researchBrief: Structured research question derived from user input
 * - notes: Accumulated research findings from all researchers
 * - rawNotes: Unprocessed notes for debugging/tracing
 * - finalReport: The completed research report
 */
export const ResearchStateAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,

  /** Structured research brief derived from user question */
  researchBrief: Annotation<string>({
    reducer: (_, right) => right ?? "",
    default: () => "",
  }),

  /** Accumulated research notes from supervisor (compressed findings) */
  notes: Annotation<string[]>({
    reducer: overrideReducer,
    default: () => [],
  }),

  /** Raw unprocessed notes for tracing */
  rawNotes: Annotation<string[]>({
    reducer: overrideReducer,
    default: () => [],
  }),

  /** Final generated report */
  finalReport: Annotation<string>({
    reducer: (_, right) => right ?? "",
    default: () => "",
  }),

  /** Supervisor messages (separate from user messages) */
  supervisorMessages: Annotation<BaseMessage[]>({
    reducer: overrideReducer,
    default: () => [],
  }),
});

export type ResearchState = typeof ResearchStateAnnotation.State;

// ─────────────────────────────────────────────────────────────────────────────
// Supervisor Subgraph State
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Supervisor state for managing research delegation.
 *
 * The supervisor:
 * - Receives the research brief
 * - Decides what topics to research (via ConductResearch tool)
 * - Delegates to researcher subgraphs
 * - Signals completion (via ResearchComplete tool)
 */
export const SupervisorStateAnnotation = Annotation.Root({
  /** Supervisor's conversation messages */
  supervisorMessages: Annotation<BaseMessage[]>({
    reducer: overrideReducer,
    default: () => [],
  }),

  /** The research brief to investigate */
  researchBrief: Annotation<string>({
    reducer: (_, right) => right ?? "",
    default: () => "",
  }),

  /** Accumulated notes from completed research tasks */
  notes: Annotation<string[]>({
    reducer: overrideReducer,
    default: () => [],
  }),

  /** Raw notes for tracing */
  rawNotes: Annotation<string[]>({
    reducer: overrideReducer,
    default: () => [],
  }),

  /** Number of supervisor iterations (for limit enforcement) */
  researchIterations: Annotation<number>({
    reducer: (_, right) => right ?? 0,
    default: () => 0,
  }),
});

export type SupervisorState = typeof SupervisorStateAnnotation.State;

// ─────────────────────────────────────────────────────────────────────────────
// Researcher Subgraph State
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Researcher state for conducting focused research on a specific topic.
 *
 * Each researcher:
 * - Receives a specific research topic from the supervisor
 * - Uses web search and other tools to gather information
 * - Compresses findings into a structured summary
 */
export const ResearcherStateAnnotation = Annotation.Root({
  /** Researcher's conversation messages */
  researcherMessages: Annotation<BaseMessage[]>({
    reducer: (left, right) => [...(left ?? []), ...(right ?? [])],
    default: () => [],
  }),

  /** The specific topic to research */
  researchTopic: Annotation<string>({
    reducer: (_, right) => right ?? "",
    default: () => "",
  }),

  /** Compressed research summary (output) */
  compressedResearch: Annotation<string>({
    reducer: (_, right) => right ?? "",
    default: () => "",
  }),

  /** Raw notes from this researcher */
  rawNotes: Annotation<string[]>({
    reducer: overrideReducer,
    default: () => [],
  }),

  /** Tool call iteration count (for limit enforcement) */
  toolCallIterations: Annotation<number>({
    reducer: (_, right) => right ?? 0,
    default: () => 0,
  }),
});

export type ResearcherState = typeof ResearcherStateAnnotation.State;

// ─────────────────────────────────────────────────────────────────────────────
// Structured Output Types (for supervisor tool routing)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ConductResearch: Supervisor signals to delegate research on a topic.
 * When the supervisor LLM "calls" this tool, the supervisor_tools node
 * spawns a researcher subgraph to investigate.
 */
export interface ConductResearchArgs {
  /** The topic to research - should be detailed (at least a paragraph) */
  researchTopic: string;
}

/**
 * ResearchComplete: Supervisor signals that research phase is done.
 * When called, the supervisor exits and proceeds to report generation.
 */
export interface ResearchCompleteArgs {
  /** Optional summary of why research is complete */
  summary?: string;
}
