// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/ai-core/usage/usage`
 * Purpose: Usage fact type for run-centric billing with idempotency.
 * Scope: Defines UsageFact and ExecutorType. Does NOT implement functions.
 * Invariants:
 *   - SINGLE_SOURCE_OF_TRUTH: This is the canonical definition; src/types re-exports
 *   - usageUnitId is optional; billing.ts assigns fallback if missing
 *   - runId + attempt + usageUnitId form the idempotency key (computed by billing.ts)
 *   - source identifies the adapter system (litellm, anthropic_sdk, etc.)
 *   - executorType is REQUIRED for executor-agnostic billing/history
 * Side-effects: none (types only)
 * Links: billing.ts (computeIdempotencyKey, commitUsageFact), GRAPH_EXECUTION.md, LANGGRAPH_SERVER.md
 * @public
 */

import type { SourceSystem } from "../billing/source-system";

/**
 * Executor type for multi-runtime billing.
 * Per EXECUTOR_TYPE_REQUIRED invariant: all UsageFacts must specify executorType.
 */
export type ExecutorType = "langgraph_server" | "claude_sdk" | "inproc";

/**
 * Usage fact emitted by graph executors for billing ingestion.
 * Per GRAPH_EXECUTION.md: adapters emit usage_report events containing UsageFact.
 * Billing subscriber commits facts to ledger via commitUsageFact().
 *
 * Idempotency: (source_system, source_reference) where source_reference = runId/attempt/usageUnitId
 */
export interface UsageFact {
  // Required for idempotency key computation (usageUnitId resolved at commit time)
  readonly runId: string;
  readonly attempt: number;
  /**
   * Adapter-provided stable ID for this usage unit.
   * For LiteLLM: litellmCallId from x-litellm-call-id header or response body id.
   * If undefined, billing.ts assigns fallback: MISSING:${runId}/${callIndex}
   */
  readonly usageUnitId?: string;

  /** Source system for source_system column (NOT in idempotency key) */
  readonly source: SourceSystem;

  /**
   * Executor type for cross-executor billing (REQUIRED).
   * Per EXECUTOR_TYPE_REQUIRED invariant in LANGGRAPH_SERVER.md.
   */
  readonly executorType: ExecutorType;

  // Required billing context
  readonly billingAccountId: string;
  readonly virtualKeyId: string;

  // Provider details
  readonly provider?: string;
  readonly model?: string;

  // Usage metrics
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly cacheReadTokens?: number;
  readonly cacheWriteTokens?: number;
  readonly costUsd?: number;

  /** Raw payload for debugging (adapter can stash native IDs here) */
  readonly usageRaw?: Record<string, unknown>;
}
