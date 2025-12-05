// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/observability`
 * Purpose: Cross-cutting observability - events, logging, context.
 * Scope: Unified entry point for all observability utilities. Does not implement logic.
 * Invariants: No imports from bootstrap or ports (structural typing only).
 * Side-effects: none
 * Notes: Minimal public API - events registry + logEvent + context.
 * Links: Delegates to events, server, client, context submodules.
 * @public
 */

// Client-side logging
export * as clientLogger from "./client";
// Context
export type { Clock, RequestContext } from "./context";
export { createRequestContext } from "./context";
export type { EventBase, EventName } from "./events";
// Event Registry (shared by client and server)
export { EVENT_NAMES } from "./events";
// Type-only exports for domain event payloads (used by features)
export type { AiLlmCallEvent } from "./events/ai";
export type {
  PaymentsConfirmedEvent,
  PaymentsIntentCreatedEvent,
  PaymentsStateTransitionEvent,
  PaymentsStatusReadEvent,
  PaymentsVerifiedEvent,
} from "./events/payments";
export type { LlmErrorCode, Logger } from "./server";
// Server-side logging
export {
  aiChatStreamDurationMs,
  aiLlmCallDurationMs,
  aiLlmCostUsdTotal,
  aiLlmErrorsTotal,
  aiLlmTokensTotal,
  classifyLlmError,
  httpRequestDurationMs,
  httpRequestsTotal,
  logEvent,
  logRequestEnd,
  logRequestError,
  logRequestStart,
  logRequestWarn,
  makeLogger,
  makeNoopLogger,
  metricsRegistry,
  statusBucket,
} from "./server";
