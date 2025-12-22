// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/ai/tool-registry`
 * Purpose: Registry of bound tools (contract + implementation) and graph→tool mappings.
 * Scope: Feature-level tool registration. Does not import adapters (pure implementations only).
 * Invariants:
 *   - Each tool has Zod input/output schemas for validation
 *   - Allowlist defines UI-safe fields for streaming
 *   - Graph→tool mapping determines which tools are available per graph
 * Side-effects: none (types and registries only)
 * Notes: getToolsForGraph() returns LLM definitions + bound tools for execution
 * Links: types.ts, tool-runner.ts, inproc-graph.adapter.ts
 * @public
 */

import type { LlmToolDefinition } from "@/ports";

import {
  GET_CURRENT_TIME_NAME,
  getCurrentTimeBoundTool,
  getCurrentTimeLlmDefinition,
} from "./tools/get-current-time.tool";
import type { BoundTool } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Tool Registries
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registry of all bound tools (contract + implementation).
 * Used by tool-runner for execution.
 */
const BOUND_TOOLS: Record<
  string,
  BoundTool<string, unknown, unknown, Record<string, unknown>>
> = {
  // Cast needed due to TypeScript variance with generic function types
  [GET_CURRENT_TIME_NAME]: getCurrentTimeBoundTool as BoundTool<
    string,
    unknown,
    unknown,
    Record<string, unknown>
  >,
};

/**
 * Registry of LLM tool definitions (OpenAI-compatible format).
 * Used when calling LLM with tools.
 */
const LLM_TOOL_DEFINITIONS: Record<string, LlmToolDefinition> = {
  [GET_CURRENT_TIME_NAME]: getCurrentTimeLlmDefinition,
};

// ─────────────────────────────────────────────────────────────────────────────
// Graph → Tool Mapping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mapping of graph names to their available tool names.
 * Determines which tools are available for each graph type.
 */
const GRAPH_TOOL_MAPPING: Record<string, readonly string[]> = {
  chat_graph: [GET_CURRENT_TIME_NAME],
};

/**
 * Result of getToolsForGraph() - everything needed to execute tools in a graph.
 */
export interface GraphTools {
  /** LLM tool definitions to send with completion request */
  readonly llmDefinitions: LlmToolDefinition[];
  /** Bound tools for execution via toolRunner */
  readonly boundTools: Record<
    string,
    BoundTool<string, unknown, unknown, Record<string, unknown>>
  >;
}

/**
 * Get tools available for a specific graph.
 * Returns LLM definitions (for LLM request) and bound tools (for execution).
 *
 * @param graphName - Name of the graph (e.g., "chat_graph")
 * @returns GraphTools with llmDefinitions and boundTools
 */
export function getToolsForGraph(graphName: string): GraphTools {
  const toolNames = GRAPH_TOOL_MAPPING[graphName] ?? [];

  const llmDefinitions: LlmToolDefinition[] = [];
  const boundTools: Record<
    string,
    BoundTool<string, unknown, unknown, Record<string, unknown>>
  > = {};

  for (const name of toolNames) {
    const llmDef = LLM_TOOL_DEFINITIONS[name];
    const bound = BOUND_TOOLS[name];

    if (llmDef && bound) {
      llmDefinitions.push(llmDef);
      boundTools[name] = bound;
    }
  }

  return { llmDefinitions, boundTools };
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Type representing all registered tool names.
 */
export type RegisteredToolName = keyof typeof BOUND_TOOLS;

/**
 * Check if a tool name is registered.
 */
export function isRegisteredTool(name: string): name is RegisteredToolName {
  return name in BOUND_TOOLS;
}

/**
 * Get all registered tool names.
 */
export function getRegisteredToolNames(): string[] {
  return Object.keys(BOUND_TOOLS);
}
