// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/ai-core/tooling/runtime/tool-policy`
 * Purpose: Tool policy interface and default implementations for deny-by-default enforcement.
 * Scope: Policy decision logic only. Does not execute tools or touch IO.
 * Invariants:
 *   - DENY_BY_DEFAULT: Unknown tools fail with policy_denied, never pass silently
 *   - POLICY_IS_DATA: Enable/disable is config, not code
 *   - Single enforcement point in toolRunner.exec()
 * Side-effects: none
 * Links: TOOL_USE_SPEC.md, tool-runner.ts
 * @public
 */

import type { ToolEffect } from "../types";

/**
 * Minimal context for policy decisions.
 * P0: runId only. P1+: add caller, tenant, role as needed.
 */
export interface ToolPolicyContext {
  readonly runId: string;
}

/**
 * Result of a policy decision.
 * - allow: Tool may execute
 * - deny: Tool blocked (returns policy_denied error)
 * - require_approval: P1 human-in-the-loop (throws in P0)
 */
export type ToolPolicyDecision = "allow" | "deny" | "require_approval";

/**
 * Tool policy interface for deny-by-default enforcement.
 * Policy is evaluated at runtime by toolRunner.exec().
 *
 * Double enforcement pattern:
 * 1. ToolCatalog filters LLM visibility (model only sees allowed tools)
 * 2. toolRunner.exec() enforces at runtime (defense in depth)
 */
export interface ToolPolicy {
  /** Explicit allowlist of tool IDs that may execute */
  readonly allowedTools: readonly string[];

  /** Effects that require approval before execution (P1: human-in-the-loop) */
  readonly requireApprovalForEffects?: readonly ToolEffect[];

  /** Runtime budgets per tool invocation */
  readonly budgets?: {
    readonly maxRuntimeMs?: number;
    readonly maxResultBytes?: number;
  };

  /**
   * Decide if a tool invocation is allowed.
   * ONLY called by toolRunner.exec() — single enforcement point.
   *
   * @param ctx - Minimal context for policy decision
   * @param toolId - Namespaced tool ID (e.g., "core__get_current_time")
   * @param effect - Tool's declared effect level
   * @returns Policy decision
   */
  decide(
    ctx: ToolPolicyContext,
    toolId: string,
    effect: ToolEffect
  ): ToolPolicyDecision;
}

/**
 * Deny-all policy: rejects every tool invocation.
 * Used as default when no policy is provided (DENY_BY_DEFAULT invariant).
 */
export const DENY_ALL_POLICY: ToolPolicy = {
  allowedTools: [],
  decide: () => "deny",
};

/**
 * Create a simple allowlist-based policy.
 * Tools in allowlist are allowed; all others denied.
 *
 * @param allowedTools - Tool IDs to allow
 * @param options - Optional policy configuration
 * @returns ToolPolicy instance
 */
export function createToolAllowlistPolicy(
  allowedTools: readonly string[],
  options?: {
    requireApprovalForEffects?: readonly ToolEffect[];
    budgets?: ToolPolicy["budgets"];
  }
): ToolPolicy {
  const allowedSet = new Set(allowedTools);
  const approvalEffects = new Set(options?.requireApprovalForEffects ?? []);

  // Build result with conditional spreads for exactOptionalPropertyTypes
  const result: ToolPolicy = {
    allowedTools,
    ...(options?.requireApprovalForEffects !== undefined && {
      requireApprovalForEffects: options.requireApprovalForEffects,
    }),
    ...(options?.budgets !== undefined && { budgets: options.budgets }),

    decide(
      _ctx: ToolPolicyContext,
      toolId: string,
      effect: ToolEffect
    ): ToolPolicyDecision {
      // Check allowlist first
      if (!allowedSet.has(toolId)) {
        return "deny";
      }

      // Check if effect requires approval
      if (approvalEffects.has(effect)) {
        return "require_approval";
      }

      return "allow";
    },
  };

  return result;
}
