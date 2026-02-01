// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/ai-core/tooling/ports/tool-source.port`
 * Purpose: Port interface for tool sources (static catalog, MCP, etc.).
 * Scope: Defines ToolSourcePort for abstracting tool discovery and execution. Does NOT import Zod or execute tools.
 * Invariants:
 *   - TOOL_SOURCE_RETURNS_BOUND_TOOL: getBoundTool returns executable BoundToolRuntime
 *   - ARCH_SINGLE_EXECUTION_PATH: All tool execution flows through toolRunner.exec()
 *   - No Zod imports — validation logic lives in BoundToolRuntime implementations
 * Side-effects: none (types only)
 * Links: TOOL_USE_SPEC.md #27
 * @public
 */

import type { BoundToolRuntime, ToolSpec } from "../types";

/**
 * Port interface for tool sources.
 *
 * Abstracts over different tool providers:
 * - StaticToolSource: wraps TOOL_CATALOG from @cogni/ai-tools
 * - McpToolSource (P1): wraps MCP server tools
 *
 * Per TOOL_SOURCE_RETURNS_BOUND_TOOL: getBoundTool returns an executable
 * BoundToolRuntime that owns validation/execution/redaction logic.
 * toolRunner orchestrates the pipeline but never imports Zod.
 */
export interface ToolSourcePort {
  /**
   * Get an executable tool by ID.
   * Returns undefined if tool not found in this source.
   *
   * @param toolId - Namespaced tool ID (e.g., "core__get_current_time")
   * @returns BoundToolRuntime if found, undefined otherwise
   */
  getBoundTool(toolId: string): BoundToolRuntime | undefined;

  /**
   * List all tool specs for LLM exposure.
   * Used to build the tool catalog sent to the model.
   *
   * @returns Array of ToolSpec (compiled from BoundToolRuntime.spec)
   */
  listToolSpecs(): readonly ToolSpec[];

  /**
   * Check if a tool ID exists in this source.
   *
   * @param toolId - Namespaced tool ID
   * @returns true if tool exists in this source
   */
  hasToolId(toolId: string): boolean;
}
