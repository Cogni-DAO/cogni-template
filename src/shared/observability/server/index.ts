// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/observability/server`
 * Purpose: Server-side logging utilities (pino-based).
 * Scope: Logger factory, helpers, and logEvent() wrapper. Does not define events.
 * Invariants: none
 * Side-effects: IO (logging to stdout)
 * Notes: Use for server-side code only. Event names from ../events.ts.
 * Links: Uses event registry from ../events; called by routes/features/adapters.
 * @public
 */

export {
  logRequestEnd,
  logRequestError,
  logRequestStart,
  logRequestWarn,
} from "./helpers";
export { logEvent } from "./logEvent";
export type { Logger } from "./logger";
export { makeLogger, makeNoopLogger } from "./logger";
export {
  aiChatStreamDurationMs,
  aiLlmCallDurationMs,
  aiLlmCostUsdTotal,
  aiLlmErrorsTotal,
  aiLlmTokensTotal,
  classifyLlmError,
  httpRequestDurationMs,
  httpRequestsTotal,
  type LlmErrorCode,
  metricsRegistry,
  publicRateLimitExceededTotal,
  statusBucket,
} from "./metrics";
export { REDACT_PATHS } from "./redact";
