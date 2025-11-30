// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/observability/logging`
 * Purpose: Public API for structured logging across the application.
 * Scope: Re-export logger factory, helpers, event schemas, and Logger type. Does not implement logging transport.
 * Invariants: none
 * Side-effects: none
 * Notes: Import from this module, not from submodules. Cross-cutting observability concern.
 * Links: Delegates to logger, helpers, events, and redact submodules.
 * @public
 */

export type {
  AiCompletionEvent,
  AiEvent,
  AiEventType,
  AiLlmCallEvent,
  PaymentsConfirmedEvent,
  PaymentsEvent,
  PaymentsEventType,
  PaymentsIntentCreatedEvent,
  PaymentsStateTransitionEvent,
  PaymentsVerifiedEvent,
} from "./events";
export {
  logRequestEnd,
  logRequestError,
  logRequestStart,
  logRequestWarn,
} from "./helpers";
export type { Logger } from "./logger";
export { makeLogger, makeNoopLogger } from "./logger";
export { REDACT_PATHS } from "./redact";
