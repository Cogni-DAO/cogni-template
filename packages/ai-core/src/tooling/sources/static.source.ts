// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/ai-core/tooling/sources/static.source`
 * Purpose: Static tool source implementation wrapping a pre-built tool map.
 * Scope: Implements ToolSourcePort for static tool catalogs. Does NOT import Zod or modify tools.
 * Invariants:
 *   - TOOL_SOURCE_RETURNS_BOUND_TOOL: Returns BoundToolRuntime from map
 *   - TOOL_ID_STABILITY: No mutations after construction
 * Side-effects: none
 * Links: TOOL_USE_SPEC.md #27
 * @public
 */

import type { ToolSourcePort } from "../ports/tool-source.port";
import type { BoundToolRuntime, ToolSpec } from "../types";

/**
 * Static tool source that wraps a pre-built map of BoundToolRuntime.
 *
 * This is the primary tool source for static tools defined in @cogni/ai-tools.
 * Use createStaticToolSource() to create from ai-tools catalog.
 *
 * Per TOOL_SOURCE_RETURNS_BOUND_TOOL: getBoundTool returns executable
 * BoundToolRuntime that owns validation/execution/redaction logic.
 */
export class StaticToolSource implements ToolSourcePort {
  private readonly toolMap: ReadonlyMap<string, BoundToolRuntime>;
  private readonly specs: readonly ToolSpec[];

  /**
   * Create a StaticToolSource from a map of BoundToolRuntime.
   *
   * @param tools - Map of tool ID → BoundToolRuntime
   */
  constructor(tools: ReadonlyMap<string, BoundToolRuntime>) {
    this.toolMap = tools;
    // Pre-compute specs for listToolSpecs()
    this.specs = Array.from(tools.values()).map((t) => t.spec);
  }

  /**
   * Get an executable tool by ID.
   *
   * @param toolId - Namespaced tool ID (e.g., "core__get_current_time")
   * @returns BoundToolRuntime if found, undefined otherwise
   */
  getBoundTool(toolId: string): BoundToolRuntime | undefined {
    return this.toolMap.get(toolId);
  }

  /**
   * List all tool specs for LLM exposure.
   *
   * @returns Array of ToolSpec
   */
  listToolSpecs(): readonly ToolSpec[] {
    return this.specs;
  }

  /**
   * Check if a tool ID exists in this source.
   *
   * @param toolId - Namespaced tool ID
   * @returns true if tool exists
   */
  hasToolId(toolId: string): boolean {
    return this.toolMap.has(toolId);
  }

  /**
   * Get the number of tools in this source.
   */
  get size(): number {
    return this.toolMap.size;
  }

  /**
   * Get all tool IDs in this source.
   */
  getToolIds(): readonly string[] {
    return Array.from(this.toolMap.keys());
  }
}

/**
 * Create a StaticToolSource from an array of BoundToolRuntime.
 *
 * @param tools - Array of BoundToolRuntime
 * @returns StaticToolSource instance
 * @throws If duplicate tool IDs are detected (per TOOL_ID_STABILITY)
 */
export function createStaticToolSource(
  tools: readonly BoundToolRuntime[]
): StaticToolSource {
  const map = new Map<string, BoundToolRuntime>();

  for (const tool of tools) {
    if (map.has(tool.id)) {
      throw new Error(
        `TOOL_ID_STABILITY violation: Duplicate tool ID "${tool.id}". ` +
          "Tool IDs must be unique within a source."
      );
    }
    map.set(tool.id, tool);
  }

  return new StaticToolSource(map);
}

/**
 * Create a StaticToolSource from a Record of BoundToolRuntime.
 *
 * @param tools - Record of tool ID → BoundToolRuntime
 * @returns StaticToolSource instance
 */
export function createStaticToolSourceFromRecord(
  tools: Readonly<Record<string, BoundToolRuntime>>
): StaticToolSource {
  return new StaticToolSource(new Map(Object.entries(tools)));
}
