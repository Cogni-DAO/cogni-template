// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/ai/tool-catalog`
 * Purpose: Per-request visibility filter for tools exposed to the model.
 * Scope: Catalog construction and lookup only. Does not execute tools or touch IO.
 * Invariants:
 *   - CATALOG_IS_EXPLICIT: Model only sees tools in catalog (no surprise tools)
 *   - TOOL_ID_NAMESPACED: ToolSpec.name IS the canonical toolId (e.g., "core__get_current_time")
 *   - Uses ToolSpec (compiled JSONSchema7), not ToolContract (Zod)
 *   - Double enforcement: catalog filters visibility, toolRunner enforces at runtime
 * Side-effects: none
 * Links: TOOL_USE_SPEC.md, tool-policy.ts, @cogni/ai-core/tooling/types.ts
 * @public
 */

import type { ToolSpec } from "@cogni/ai-core";

import type { ToolPolicy, ToolPolicyContext } from "./tool-policy";

/**
 * Tool catalog: the per-request set of tools exposed to the model.
 * Built at bootstrap by compiling graph's ToolContracts AFTER policy filtering.
 * The model ONLY sees tools in this catalog — no surprise tools.
 *
 * Uses ToolSpec (compiled JSONSchema7) for wire format compatibility.
 * Zod schemas stay in @cogni/ai-tools; compile before passing to catalog.
 *
 * Note: ToolSpec.name IS the canonical toolId per TOOL_ID_NAMESPACED invariant
 * (e.g., "core__get_current_time"). There is no separate toolId field.
 */
export interface ToolCatalog {
  /** Tools exposed to the model for this request (post-policy filtering) */
  readonly tools: ReadonlyMap<string, ToolSpec>;

  /**
   * Get tool spec by ID.
   * @param toolId - Namespaced tool ID (e.g., "core__get_current_time")
   * @returns ToolSpec if in catalog, undefined otherwise
   */
  get(toolId: string): ToolSpec | undefined;

  /**
   * List all tool specs (for LLM tools parameter).
   * @returns Array of all tools in catalog
   */
  list(): readonly ToolSpec[];
}

/** Shared frozen empty map for EMPTY_CATALOG (immutable singleton) */
const FROZEN_EMPTY_MAP: ReadonlyMap<string, ToolSpec> = Object.freeze(
  new Map<string, ToolSpec>()
);

/** Shared frozen empty array for EMPTY_CATALOG.list() */
const FROZEN_EMPTY_ARRAY: readonly ToolSpec[] = Object.freeze([]);

/**
 * Empty catalog: no tools visible to model.
 * Used when no tools are configured or all are denied.
 * Immutable singleton - safe to share across requests.
 */
export const EMPTY_CATALOG: ToolCatalog = Object.freeze({
  tools: FROZEN_EMPTY_MAP,
  get: () => undefined,
  list: () => FROZEN_EMPTY_ARRAY,
});

/** Default context for catalog construction (bootstrap-time filtering) */
const DEFAULT_CATALOG_CTX: ToolPolicyContext = { runId: "catalog_bootstrap" };

/**
 * Create a tool catalog from specs, filtered by policy.
 * Uses policy.decide() to determine visibility — tools that would be denied
 * or require approval are excluded from the catalog.
 *
 * Double enforcement pattern:
 * 1. This function filters which tools the LLM sees (visibility)
 * 2. toolRunner.exec() re-checks policy at runtime (defense in depth)
 *
 * P0: Both 'deny' and 'require_approval' decisions exclude the tool from catalog.
 * This prevents the LLM from seeing tools it cannot execute, avoiding retry spam.
 *
 * Note: Filters by ToolSpec.name which IS the canonical toolId per TOOL_ID_NAMESPACED.
 *
 * @param specs - All available tool specs (from graph's compiled ToolContracts)
 * @param policy - Policy for filtering visibility
 * @param ctx - Optional context for policy decisions (defaults to bootstrap context)
 * @returns ToolCatalog with only allowed tools
 */
export function createToolCatalog(
  specs: readonly ToolSpec[],
  policy: ToolPolicy,
  ctx: ToolPolicyContext = DEFAULT_CATALOG_CTX
): ToolCatalog {
  // Filter using policy.decide() — only 'allow' decisions pass
  const filteredSpecs = specs.filter((spec) => {
    const decision = policy.decide(ctx, spec.name, spec.effect);
    // P0: require_approval treated as deny (human-in-the-loop is P1)
    return decision === "allow";
  });

  if (filteredSpecs.length === 0) {
    return EMPTY_CATALOG;
  }

  const toolsMap = new Map<string, ToolSpec>(
    filteredSpecs.map((spec) => [spec.name, spec])
  );

  // Cache the list for repeated calls
  const cachedList = Object.freeze([...toolsMap.values()]);

  // Freeze for consistency with EMPTY_CATALOG
  return Object.freeze({
    tools: toolsMap,
    get: (toolId: string) => toolsMap.get(toolId),
    list: () => cachedList,
  });
}
