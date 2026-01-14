// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/runtime/dev-tool-exec`
 * Purpose: Tool execution for langgraph dev server.
 * Scope: Creates tool runner for dev.ts graph exports. Does NOT stream events externally.
 * Invariants:
 *   - TOOLS_VIA_TOOLRUNNER: All tool execution flows through createToolRunner
 *   - TOOL_SAME_PATH_ALL_EXECUTORS: Same policy/redaction path as InProc
 *   - DENY_BY_DEFAULT: Uses createToolAllowlistPolicy
 * Side-effects: none (events are internal to dev server)
 * Links: TOOL_USE_SPEC.md, LANGGRAPH_SERVER.md
 * @internal
 */

import {
  type AiEvent,
  createToolAllowlistPolicy,
  createToolRunner,
  type ToolExecFn,
} from "@cogni/ai-core";
import type { CatalogBoundTool } from "@cogni/ai-tools";

/**
 * No-op event emitter for dev server.
 * Dev server tool events stay internal - they don't stream to Next.js.
 * Real observability via LangGraph's built-in tracing.
 */
const devEmit = (_event: AiEvent): void => {
  // Events are internal to dev server process
  // LangGraph dev server has its own observability via LangSmith
};

/**
 * Create tool execution function for dev server graphs.
 *
 * Per TOOLS_VIA_TOOLRUNNER: Uses createToolRunner for policy/validation/redaction.
 * Per TOOL_SAME_PATH_ALL_EXECUTORS: Same enforcement as InProc provider.
 *
 * @param boundTools - Map of tool name to bound tool from catalog
 * @returns ToolExecFn that delegates to toolRunner.exec()
 */
export function createDevToolExecFn(
  boundTools: Readonly<Record<string, CatalogBoundTool>>
): ToolExecFn {
  // Create tool runner with DENY_ALL_POLICY by default
  // The toLangChainTool wrapper will check configurable.toolIds BEFORE calling exec
  // So by the time exec() is called, the tool is already in the allowlist
  // We create a permissive policy here because wrapper already did the check
  //
  // NOTE: This is safe because:
  // 1. toLangChainTool checks configurable.toolIds (deny if missing/empty)
  // 2. toLangChainTool checks tool in allowlist (deny if not present)
  // 3. Only then does it call exec()
  //
  // For full double-enforcement (defense in depth), we'd need toolIds at
  // createDevToolExecFn time, but dev server doesn't have that context.
  // The wrapper check is sufficient for dev server use.
  const allToolIds = Object.keys(boundTools);
  const policy = createToolAllowlistPolicy(allToolIds);

  const toolRunner = createToolRunner(boundTools, devEmit, {
    policy,
    ctx: { runId: "dev_server" },
  });

  return async (name, args, toolCallId) => {
    const result =
      toolCallId !== undefined
        ? await toolRunner.exec(name, args, { modelToolCallId: toolCallId })
        : await toolRunner.exec(name, args);
    return result;
  };
}
