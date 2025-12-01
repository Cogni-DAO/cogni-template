// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/observability/logging/events`
 * Purpose: Strict event schemas for structured logging across domains.
 * Scope: Define log event types and their required/optional fields. Does not implement event creation.
 * Invariants: All events include routeId, reqId; domain-specific fields typed.
 * Side-effects: none
 * Notes: Use these types to ensure searchable, consistent logs across features.
 * Links: Imported by observability/logging; used by features for domain events.
 * @public
 */

// ============================================================================
// AI Domain Events
// ============================================================================

export type AiEventType = "ai.completion" | "ai.llm_call";

export interface AiCompletionEvent {
  event: "ai.completion";
  routeId: string;
  reqId: string;
  billingAccountId: string;
  durationMs: number;
  tokensUsed?: number | undefined;
  providerCostUsd?: number | undefined;
}

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

export type AiEvent = AiCompletionEvent | AiLlmCallEvent;

// ============================================================================
// Payments Domain Events
// ============================================================================

export type PaymentsEventType =
  | "payments.intent_created"
  | "payments.state_transition"
  | "payments.verified"
  | "payments.confirmed"
  | "payments.status_read";

export interface PaymentsIntentCreatedEvent {
  event: "payments.intent_created";
  routeId: string;
  reqId: string;
  billingAccountId: string;
  paymentIntentId: string;
  chainId: number;
  durationMs: number;
}

export interface PaymentsStateTransitionEvent {
  event: "payments.state_transition";
  routeId: string;
  reqId: string;
  billingAccountId: string;
  paymentIntentId: string;
  fromStatus?: string | undefined;
  toStatus: string;
  chainId: number;
  txHash?: string | undefined;
  durationMs: number;
  idempotentHit?: boolean | undefined;
}

export interface PaymentsVerifiedEvent {
  event: "payments.verified";
  routeId: string;
  reqId: string;
  billingAccountId: string;
  paymentIntentId: string;
  chainId: number;
  txHash: string;
  durationMs: number;
}

export interface PaymentsConfirmedEvent {
  event: "payments.confirmed";
  routeId: string;
  reqId: string;
  billingAccountId: string;
  paymentIntentId: string;
  chainId: number;
  txHash: string;
  creditsApplied?: number | undefined;
  durationMs: number;
}

export interface PaymentsStatusReadEvent {
  event: "payments.status_read";
  routeId: string;
  reqId: string;
  billingAccountId: string;
  paymentIntentId: string;
  status: string;
  durationMs: number;
}

export type PaymentsEvent =
  | PaymentsIntentCreatedEvent
  | PaymentsStateTransitionEvent
  | PaymentsVerifiedEvent
  | PaymentsConfirmedEvent
  | PaymentsStatusReadEvent;
