// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/runtime/cogni/tools`
 * Purpose: LangChain tool wrapper that resolves ToolExecFn from Cogni's ALS context.
 * Scope: Cogni-executor-specific tool wiring. Does NOT execute tools directly.
 * Invariants:
 *   - TOOLS_DENY_BY_DEFAULT: If toolIds missing or tool not in list, return policy_denied
 *   - TOOL_CONFIG_PROPAGATION: LangChain tool func receives config param for authorization
 *   - Uses ALS context to resolve toolExecFn at invocation time
 * Side-effects: none
 * Links: TOOL_USE_SPEC.md, LANGGRAPH_AI.md
 * @public
 */

import type { ToolContract } from "@cogni/ai-tools";
import type { StructuredToolInterface } from "@langchain/core/tools";

import { makeLangChainTools } from "../core/langchain-tools";
import { getCogniExecContext } from "./exec-context";

/**
 * Options for toLangChainToolsFromContext.
 */
export interface ToLangChainToolsFromContextOptions {
  /** Array of tool contracts */
  readonly contracts: ReadonlyArray<
    ToolContract<string, unknown, unknown, unknown>
  >;
}

/**
 * Context wrapper: Convert tool contracts to LangChain tools.
 * Reads toolExecFn from Cogni's ALS context at invocation time.
 *
 * @param opts - Options with contracts
 * @returns Array of LangChain StructuredToolInterface
 */
export function toLangChainToolsFromContext(
  opts: ToLangChainToolsFromContextOptions
): StructuredToolInterface[] {
  const { contracts } = opts;
  return makeLangChainTools({
    contracts,
    execResolver: () => getCogniExecContext().toolExecFn, // read from ALS at invocation
  });
}
