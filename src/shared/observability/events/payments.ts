// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/observability/events.payments`
 * Purpose: Strict payload schemas for payments domain events.
 * Scope: Type definitions for structured payment events. Does not implement event creation.
 * Invariants: All events extend EventBase (reqId required).
 * Side-effects: none
 * Notes: Use these types for type-safe logging in payments features/routes.
 * Links: Uses EventBase from events.ts; exported via observability/index.ts.
 * @public
 */

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
