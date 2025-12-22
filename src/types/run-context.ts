// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@types/run-context`
 * Purpose: Shared run context type for relay subscribers (billing, history, etc.).
 * Scope: Defines RunContext provided by RunEventRelay to subscribers. Does NOT implement functions (per types layer policy).
 * Invariants:
 *   - RELAY_PROVIDES_CONTEXT: Relay provides context to subscribers, not events
 *   - ingressRequestId is transport correlation only, NEVER for idempotency
 *   - runId + attempt form execution identity
 * Side-effects: none (types only)
 * Links: ai_runtime.ts (RunEventRelay), billing.ts (commitUsageFact), GRAPH_EXECUTION.md, USAGE_HISTORY.md
 * @public
 */

/**
 * Run context provided by RunEventRelay to all subscribers.
 * Per RELAY_PROVIDES_CONTEXT: subscribers receive context from relay, not from events.
 *
 * This ensures:
 * - Events (UsageFact, AssistantFinal) remain executor-agnostic
 * - Transport concerns (ingressRequestId) don't leak into billing facts
 * - All subscribers have consistent run identity
 */
export interface RunContext {
  /** Canonical execution identity (groups all LLM calls in one run) */
  readonly runId: string;
  /** Retry attempt number (P0: always 0) */
  readonly attempt: number;
  /** Delivery-layer correlation (HTTP/SSE/worker/queue). For charge_receipts.request_id only. */
  readonly ingressRequestId: string;
  /** LangGraph thread scope (optional, for history/checkpoint correlation) */
  readonly threadId?: string;
}
