// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/runtime/langchain-tools`
 * Purpose: Convert @cogni/ai-tools contracts to LangChain StructuredTool format.
 * Scope: Tool wrappers that delegate to injected exec function. Does not execute tools directly.
 * Invariants:
 *   - TOOLS_VIA_TOOLRUNNER: All tool calls delegate to exec function
 *   - Tools wrapped here do NOT execute directly — exec is injected at runtime
 *   - Uses contract.inputSchema directly (no separate schema param)
 * Side-effects: none
 * Links: TOOL_USE_SPEC.md, LANGGRAPH_AI.md
 * @public
 */

import type { ToolContract } from "@cogni/ai-tools";
import {
  DynamicStructuredTool,
  type StructuredToolInterface,
} from "@langchain/core/tools";
import type { z } from "zod";

/**
 * Result from tool execution via exec function.
 */
export interface ToolExecResult {
  readonly ok: boolean;
  readonly value?: unknown;
  readonly errorCode?: string;
  readonly safeMessage?: string;
}

/**
 * Exec function signature for tool execution.
 * Injected at runtime — routes through toolRunner for validation/redaction.
 */
export type ToolExecFn = (
  name: string,
  args: unknown
) => Promise<ToolExecResult>;

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
 */
function createTool(config: {
  name: string;
  description: string;
  schema: z.ZodTypeAny;
  func: (args: unknown) => Promise<string>;
}): unknown {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // biome-ignore lint/suspicious/noExplicitAny: TS2589 workaround - breaks deep generic instantiation
  const UntypedToolClass: any = DynamicStructuredTool;
  return new UntypedToolClass(config);
}

/**
 * Convert a tool contract to a LangChain StructuredToolInterface.
 *
 * Uses contract.inputSchema directly — no separate schema parameter needed.
 * The tool delegates execution to the injected `exec` function,
 * which should be wired to `toolRunner.exec()` to preserve validation and redaction.
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

  const tool = createTool({
    name: contract.name,
    description: contract.description,
    schema: contract.inputSchema,
    func: async (args: unknown): Promise<string> => {
      const result = await exec(contract.name, args);

      if (result.ok) {
        return JSON.stringify(result.value);
      }
      return JSON.stringify({
        error: result.errorCode ?? "execution",
        message: result.safeMessage ?? "Tool execution failed",
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
