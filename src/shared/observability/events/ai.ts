// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/observability/events.ai`
 * Purpose: Strict payload schemas for AI domain events.
 * Scope: Type definitions for structured AI events. Does not implement event creation.
 * Invariants: All events extend EventBase (reqId required).
 * Side-effects: none
 * Notes: Use these types for type-safe logging in AI features/routes.
 * Links: Uses EventBase from events.ts; exported via observability/index.ts.
 * @public
 */

export interface AiLlmCallEvent {
  event: "ai.llm_call";
  routeId: string;
  reqId: string;
  billingAccountId: string;
  model?: string | undefined;
  durationMs: number;
  tokensUsed?: number | undefined;
  providerCostUsd?: number | undefined;
}
