// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/observability/logging/helpers`
 * Purpose: Standardized logging helpers to prevent log spam and drift.
 * Scope: Provide consistent request start/end logging. Does not handle domain-specific events.
 * Invariants: Same keys everywhere (routeId, reqId, method, status, durationMs).
 * Side-effects: IO (emits structured log entries via provided logger)
 * Notes: Use logRequestStart/logRequestEnd in every instrumented route.
 * Links: Used by all route handlers; emits structured log entries.
 * @public
 */

import type { Logger } from "pino";

/**
 * Log request start with consistent fields.
 * Use at the beginning of every instrumented route handler.
 */
export function logRequestStart(log: Logger): void {
  log.info("request received");
}

/**
 * Log request end with consistent fields.
 * Use at the end of every instrumented route handler (success or error).
 * Always logs at info level - error/warn signals come from logRequestError/logRequestWarn.
 *
 * @param log - Request-scoped child logger (with routeId, reqId, method already bound)
 * @param meta - Response metadata
 */
export function logRequestEnd(
  log: Logger,
  meta: {
    status: number;
    durationMs: number;
  }
): void {
  log.info(
    { status: meta.status, durationMs: meta.durationMs },
    "request complete"
  );
}

/**
 * Log warning with consistent fields: err, errorCode, routeId (already in ctx).
 * Use for client errors (4xx) that are handled and don't indicate server issues.
 *
 * @param log - Request-scoped child logger (with routeId, reqId already bound)
 * @param error - Error object
 * @param errorCode - Stable app error code for classification
 */
export function logRequestWarn(
  log: Logger,
  error: unknown,
  errorCode: string
): void {
  log.warn({ err: error, errorCode }, "request warning handled");
}

/**
 * Log error with consistent fields: err, errorCode, routeId (already in ctx).
 * Use for server errors (5xx) that indicate internal failures.
 *
 * @param log - Request-scoped child logger (with routeId, reqId already bound)
 * @param error - Error object
 * @param errorCode - Stable app error code for classification
 */
export function logRequestError(
  log: Logger,
  error: unknown,
  errorCode: string
): void {
  log.error({ err: error, errorCode }, "request failed");
}
