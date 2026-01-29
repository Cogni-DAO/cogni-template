// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/runtime/langchain-tools`
 * Purpose: Convert @cogni/ai-tools contracts to LangChain StructuredTool format.
 * Scope: Tool wrappers that delegate to exec function resolved at invocation time. Does NOT execute tools directly.
 * Invariants:
 *   - TOOLS_VIA_TOOLRUNNER: All tool calls delegate to toolRunner.exec()
 *   - TOOLS_DENY_BY_DEFAULT: If toolIds missing or tool not in list, return policy_denied
 *   - TOOL_CONFIG_PROPAGATION: LangChain tool func receives config param for authorization
 *   - SINGLE_IMPLEMENTATION: makeLangChainTools is the single core; two thin wrappers for server/inproc
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

import { getInProcRuntime } from "./inproc-runtime";

// Re-export canonical types for consumers (per TOOL_EXEC_TYPES_IN_AI_CORE)
export type { ToolExecFn, ToolExecResult } from "@cogni/ai-core";

/**
 * Resolver that provides ToolExecFn at tool invocation time.
 * - Server: returns captured toolExecFn
 * - InProc: reads from ALS
 */
export type ExecResolver = (config?: RunnableConfig) => ToolExecFn;

/**
 * Internal factory that constructs DynamicStructuredTool without triggering TS2589.
 * Quarantines `any` at the constructor call to prevent TypeScript from attempting
 * deep generic instantiation. The public boundary returns StructuredToolInterface.
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
  // biome-ignore lint/suspicious/noExplicitAny: TS2589 workaround - breaks deep generic instantiation
  const UntypedToolClass: any = DynamicStructuredTool;
  return new UntypedToolClass(toolConfig);
}

// ============================================================================
// Core Implementation (single impl, per SINGLE_IMPLEMENTATION)
// ============================================================================

/**
 * Options for makeLangChainTool (core implementation).
 */
export interface MakeLangChainToolOptions {
  /** Tool contract from @cogni/ai-tools (includes inputSchema) */
  readonly contract: ToolContract<string, unknown, unknown, unknown>;
  /** Resolver that provides ToolExecFn at invocation time */
  readonly execResolver: ExecResolver;
}

/**
 * Core implementation: Convert a tool contract to a LangChain StructuredToolInterface.
 *
 * Uses execResolver to obtain ToolExecFn at invocation time (not bind time).
 * This enables server (captured fn) and inproc (ALS) to share the same core logic.
 *
 * Per TOOLS_DENY_BY_DEFAULT: Wrapper performs cheap prefilter on toolIds.
 * If toolIds is missing/empty or tool not in list, returns policy_denied.
 * Real policy enforcement (ToolEffect, approval) remains in ToolRunner.
 *
 * @param opts - Tool options with contract and execResolver
 * @returns LangChain StructuredToolInterface
 */
export function makeLangChainTool(
  opts: MakeLangChainToolOptions
): StructuredToolInterface {
  const { contract, execResolver } = opts;
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

      // Resolve exec at invocation time (server: captured, inproc: ALS)
      const exec = execResolver(config);

      // Tool is in allowlist — delegate to exec (ToolRunner handles full policy)
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

  return tool as StructuredToolInterface;
}

/**
 * Options for makeLangChainTools (core implementation, array version).
 */
export interface MakeLangChainToolsOptions {
  /** Array of tool contracts */
  readonly contracts: ReadonlyArray<
    ToolContract<string, unknown, unknown, unknown>
  >;
  /** Resolver that provides ToolExecFn at invocation time */
  readonly execResolver: ExecResolver;
}

/**
 * Core implementation: Convert multiple tool contracts to LangChain tools.
 *
 * @param opts - Options with contracts and execResolver
 * @returns Array of LangChain StructuredToolInterface
 */
export function makeLangChainTools(
  opts: MakeLangChainToolsOptions
): StructuredToolInterface[] {
  const { contracts, execResolver } = opts;
  return contracts.map((contract) =>
    makeLangChainTool({ contract, execResolver })
  );
}

// ============================================================================
// Thin Wrappers (server and inproc)
// ============================================================================

/**
 * Options for toLangChainToolsServer.
 */
export interface ToLangChainToolsServerOptions {
  /** Array of tool contracts */
  readonly contracts: ReadonlyArray<
    ToolContract<string, unknown, unknown, unknown>
  >;
  /** Tool exec function (captured at bind time) */
  readonly toolExecFn: ToolExecFn;
}

/**
 * Server wrapper: Convert tool contracts to LangChain tools.
 * Captures toolExecFn at bind time — used by langgraph dev server.
 *
 * @param opts - Options with contracts and toolExecFn
 * @returns Array of LangChain StructuredToolInterface
 */
export function toLangChainToolsServer(
  opts: ToLangChainToolsServerOptions
): StructuredToolInterface[] {
  const { contracts, toolExecFn } = opts;
  return makeLangChainTools({
    contracts,
    execResolver: () => toolExecFn, // captured at bind time
  });
}

/**
 * Options for toLangChainToolsInProc.
 */
export interface ToLangChainToolsInProcOptions {
  /** Array of tool contracts */
  readonly contracts: ReadonlyArray<
    ToolContract<string, unknown, unknown, unknown>
  >;
}

/**
 * InProc wrapper: Convert tool contracts to LangChain tools.
 * Reads toolExecFn from ALS at invocation time — used by Next.js inproc path.
 *
 * @param opts - Options with contracts
 * @returns Array of LangChain StructuredToolInterface
 */
export function toLangChainToolsInProc(
  opts: ToLangChainToolsInProcOptions
): StructuredToolInterface[] {
  const { contracts } = opts;
  return makeLangChainTools({
    contracts,
    execResolver: () => getInProcRuntime().toolExecFn, // read from ALS at invocation
  });
}

// ============================================================================
// Deprecated APIs (for backwards compatibility during migration)
// ============================================================================

/**
 * Options for toLangChainTool().
 * @deprecated Use makeLangChainTool with execResolver instead
 */
export interface ToLangChainToolOptions {
  /** Tool contract from @cogni/ai-tools (includes inputSchema) */
  readonly contract: ToolContract<string, unknown, unknown, unknown>;
  /** Exec function that runs through toolRunner */
  readonly exec: ToolExecFn;
}

/**
 * Convert a tool contract to a LangChain StructuredToolInterface.
 * @deprecated Use toLangChainToolsServer or toLangChainToolsInProc instead
 */
export function toLangChainTool(
  opts: ToLangChainToolOptions
): StructuredToolInterface {
  const { contract, exec } = opts;
  return makeLangChainTool({
    contract,
    execResolver: () => exec,
  });
}

/**
 * Options for toLangChainTools().
 * @deprecated Use toLangChainToolsServer or toLangChainToolsInProc instead
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
 * @deprecated Use toLangChainToolsServer or toLangChainToolsInProc instead
 */
export function toLangChainTools(
  opts: ToLangChainToolsOptions
): StructuredToolInterface[] {
  return toLangChainToolsServer({
    contracts: opts.contracts,
    toolExecFn: opts.exec,
  });
}
