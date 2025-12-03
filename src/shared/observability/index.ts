// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/observability`
 * Purpose: Cross-cutting observability concerns - logging, context, events.
 * Scope: Unified entry point for all observability utilities. Does not implement logging logic.
 * Invariants: No imports from bootstrap or ports (structural typing only).
 * Side-effects: none
 * Notes: This is the sanctioned cross-cutting layer for observability.
 * Links: Re-exports from context, logging; see submodules for implementation.
 * @public
 */

// Logging (Client)
export * as clientLogger from "./clientLogger";
export type { Clock, RequestContext } from "./context";
// Context
export { createRequestContext } from "./context";
// Event Schemas
export type {
  AiCompletionEvent,
  AiEvent,
  AiEventType,
  AiLlmCallEvent,
  Logger,
  PaymentsConfirmedEvent,
  PaymentsEvent,
  PaymentsEventType,
  PaymentsIntentCreatedEvent,
  PaymentsStateTransitionEvent,
  PaymentsVerifiedEvent,
} from "./logging";
// Logging (Server)
export {
  logRequestEnd,
  logRequestError,
  logRequestStart,
  logRequestWarn,
  makeLogger,
  makeNoopLogger,
  REDACT_PATHS,
} from "./logging";
