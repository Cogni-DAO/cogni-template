// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/ai/tool-registry`
 * Purpose: Registry mapping tool names to contracts (no implementations).
 * Scope: Feature-level tool contract definitions. Does not contain implementations (bound in bootstrap).
 * Invariants:
 *   - Does NOT import adapters (implementations injected via DI)
 *   - Each tool has Zod input/output schemas for validation
 *   - Allowlist defines UI-safe fields for streaming
 * Side-effects: none (types and contracts only)
 * Notes: P1 starts with empty registry; tools added as needed
 * Links: types.ts, tool-runner.ts, bootstrap/container.ts
 * @public
 */

import type { ToolContract } from "./types";

/**
 * Registry of all available tool contracts.
 * Maps tool name (string literal) to its contract definition.
 *
 * P1 Note: Currently empty. Add tool contracts here as features require them.
 * Example structure for future tools:
 *
 * ```typescript
 * export const TOOL_CONTRACTS = {
 *   knowledge_search: knowledgeSearchContract,
 *   web_fetch: webFetchContract,
 * } as const;
 * ```
 */
export const TOOL_CONTRACTS = {} as const satisfies Record<
  string,
  ToolContract<string, unknown, unknown, Record<string, unknown>>
>;

/**
 * Type representing all registered tool names.
 */
export type RegisteredToolName = keyof typeof TOOL_CONTRACTS;

/**
 * Type-safe lookup of a tool contract by name.
 */
export function getToolContract<TName extends RegisteredToolName>(
  name: TName
): (typeof TOOL_CONTRACTS)[TName] {
  return TOOL_CONTRACTS[name];
}

/**
 * Check if a tool name is registered.
 */
export function isRegisteredTool(name: string): name is RegisteredToolName {
  return name in TOOL_CONTRACTS;
}

/**
 * Get all registered tool names.
 */
export function getRegisteredToolNames(): ReadonlyArray<RegisteredToolName> {
  return Object.keys(TOOL_CONTRACTS) as RegisteredToolName[];
}
