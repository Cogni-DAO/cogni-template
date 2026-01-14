// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/runtime/langchain-tools`
 * Purpose: Convert @cogni/ai-tools contracts to LangChain StructuredTool format.
 * Scope: Tool wrappers that delegate to injected exec function. Does not execute tools directly.
 * Invariants:
 *   - TOOLS_VIA_TOOLRUNNER: All tool calls delegate to exec function
 *   - TOOLS_DENY_BY_DEFAULT: If toolIds missing or tool not in list, return policy_denied
 *   - TOOL_CONFIG_PROPAGATION: LangChain tool func receives config param for authorization
 *   - Tools wrapped here do NOT execute directly — exec is injected at runtime
 *   - Uses contract.inputSchema directly (no separate schema param)
 * Side-effects: none
 * Links: TOOL_USE_SPEC.md, LANGGRAPH_AI.md
 * @public
 */

import type { ToolExecFn } from "@cogni/ai-core";
import type { ToolContract } from "@cogni/ai-tools";
import type { RunnableConfig } from "@langchain/core/runnables";
import {
  DynamicStructuredTool,
  type StructuredToolInterface,
} from "@langchain/core/tools";
import type { z } from "zod";

// Re-export canonical types for consumers (per TOOL_EXEC_TYPES_IN_AI_CORE)
export type { ToolExecFn, ToolExecResult } from "@cogni/ai-core";

/**
 * Options for toLangChainTool().
 */
export interface ToLangChainToolOptions {
  /** Tool contract from @cogni/ai-tools (includes inputSchema) */
  readonly contract: ToolContract<string, unknown, unknown, unknown>;
  /** Exec function that runs through toolRunner */
  readonly exec: ToolExecFn;
}

/**
 * Internal factory that constructs DynamicStructuredTool without triggering TS2589.
 * Quarantines `any` at the constructor call to prevent TypeScript from attempting
 * deep generic instantiation. The public boundary (toLangChainTool) returns
 * StructuredToolInterface — no `any` leaks.
 *
 * Per TOOL_CONFIG_PROPAGATION: func receives (args, runManager?, config?) from LangChain.
 */
function createTool(toolConfig: {
  name: string;
  description: string;
  schema: z.ZodTypeAny;
  func: (
    args: unknown,
    runManager?: unknown,
    config?: RunnableConfig
  ) => Promise<string>;
}): unknown {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // biome-ignore lint/suspicious/noExplicitAny: TS2589 workaround - breaks deep generic instantiation
  const UntypedToolClass: any = DynamicStructuredTool;
  return new UntypedToolClass(toolConfig);
}

/**
 * Convert a tool contract to a LangChain StructuredToolInterface.
 *
 * Uses contract.inputSchema directly — no separate schema parameter needed.
 * The tool delegates execution to the injected `exec` function,
 * which should be wired to `toolRunner.exec()` to preserve validation and redaction.
 *
 * Per TOOLS_DENY_BY_DEFAULT: Wrapper performs cheap prefilter on toolIds.
 * If toolIds is missing/empty or tool not in list, returns policy_denied.
 * Real policy enforcement (ToolEffect, approval) remains in ToolRunner.
 *
 * Returns StructuredToolInterface (not DynamicStructuredTool) to avoid TS2589
 * generic instantiation blowups. This is the interface createReactAgent requires.
 *
 * @param opts - Tool options with contract and exec function
 * @returns LangChain StructuredToolInterface
 */
export function toLangChainTool(
  opts: ToLangChainToolOptions
): StructuredToolInterface {
  const { contract, exec } = opts;
  const toolName = contract.name;

  const tool = createTool({
    name: toolName,
    description: contract.description,
    schema: contract.inputSchema,
    func: async (
      args: unknown,
      _runManager?: unknown,
      config?: RunnableConfig
    ): Promise<string> => {
      // TOOLS_DENY_BY_DEFAULT: Check toolIds allowlist from configurable
      // This is a cheap prefilter; real policy enforcement is in ToolRunner
      const configurable = config?.configurable as
        | { toolIds?: string[] }
        | undefined;
      const toolIds = configurable?.toolIds;

      // If toolIds is undefined, null, or empty => DENY
      if (!toolIds || toolIds.length === 0) {
        return JSON.stringify({
          error: "policy_denied",
          message: `Tool '${toolName}' denied: no toolIds configured (deny-by-default)`,
        });
      }

      // If tool not in allowlist => DENY
      if (!toolIds.includes(toolName)) {
        return JSON.stringify({
          error: "policy_denied",
          message: `Tool '${toolName}' not in allowed toolIds`,
        });
      }

      // Tool is in allowlist — delegate to exec (ToolRunner handles full policy)
      // P0: toolRunner generates canonical toolCallId (per TOOLCALLID_STABLE)
      // P1: extract providerToolCallId from AIMessage.tool_calls in runner layer
      const result = await exec(toolName, args, undefined);

      if (result.ok) {
        return JSON.stringify(result.value);
      }
      // Discriminated union guarantees errorCode and safeMessage exist when ok=false
      return JSON.stringify({
        error: result.errorCode,
        message: result.safeMessage,
      });
    },
  });

  // Single quarantined cast from unknown to StructuredToolInterface
  return tool as StructuredToolInterface;
}

/**
 * Options for toLangChainTools().
 */
export interface ToLangChainToolsOptions {
  /** Array of tool contracts */
  readonly contracts: ReadonlyArray<
    ToolContract<string, unknown, unknown, unknown>
  >;
  /** Exec function for all tools */
  readonly exec: ToolExecFn;
}

/**
 * Convert multiple tool contracts to LangChain StructuredToolInterface[].
 *
 * @param opts - Options with contracts and exec function
 * @returns Array of LangChain StructuredToolInterface
 */
export function toLangChainTools(
  opts: ToLangChainToolsOptions
): StructuredToolInterface[] {
  const { contracts, exec } = opts;
  return contracts.map((contract) => toLangChainTool({ contract, exec }));
}
