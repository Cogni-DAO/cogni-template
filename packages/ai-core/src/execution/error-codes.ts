// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/ai-core/execution/error-codes`
 * Purpose: Canonical error codes for AI graph/completion execution failures.
 * Scope: Single source of truth for execution error codes across all layers. Does NOT define business logic or error handling behavior.
 * Invariants:
 *   - SINGLE_SOURCE_OF_TRUTH: All error codes defined here, imported everywhere else
 *   - Used by ports (re-export), langgraph-graphs (direct), adapters (data propagation)
 * Side-effects: none (types only)
 * Links: GRAPH_EXECUTION.md, LANGGRAPH_AI.md
 * @public
 */

/**
 * Canonical error codes for AI execution failures.
 * - invalid_request: Required input missing or malformed (client error)
 * - timeout: Request exceeded time limit
 * - aborted: Request was cancelled (e.g., AbortSignal)
 * - internal: Unexpected error during execution (server fault)
 * - insufficient_credits: Billing account lacks sufficient credits
 */
export type AiExecutionErrorCode =
  | "invalid_request"
  | "timeout"
  | "aborted"
  | "internal"
  | "insufficient_credits";
