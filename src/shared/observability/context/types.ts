// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/observability/context/types`
 * Purpose: Request-scoped context type for passing logger, session, and clock through layers.
 * Scope: Define RequestContext interface. Does not implement context creation or lifecycle.
 * Invariants: log is child logger with reqId, route, method bound.
 * Side-effects: none
 * Notes: Pass ctx through facades → features → use-cases for logging. Cross-cutting observability concern.
 * Links: Used by factory module; passed through all request handlers.
 * @public
 */

import type { Logger } from "pino";

import type { SessionUser } from "@/shared/auth";

/**
 * Minimal clock interface for timestamp generation.
 * Structural typing - any object with now() satisfies this (including ports/Clock).
 * Returns ISO 8601 string format to match domain layer convention.
 */
export interface Clock {
  now(): string;
}

export interface RequestContext {
  log: Logger; // Child logger with reqId, route, method
  reqId: string; // Request correlation ID
  routeId: string; // Route identifier (e.g., "payments.intents")
  session?: SessionUser | undefined; // Authenticated user (optional)
  clock: Clock; // Time provider for testability
}
