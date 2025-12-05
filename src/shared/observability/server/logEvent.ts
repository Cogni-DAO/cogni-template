// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/observability/server/logEvent`
 * Purpose: Type-safe event logger that enforces event name registry and base fields.
 * Scope: Single function for logging structured events with schema validation. Does not create loggers.
 * Invariants: reqId MUST be present (throws in CI/tests, logs error elsewhere); event name MUST be from registry.
 * Side-effects: IO (logging)
 * Notes: Prevents ad-hoc string event names and missing base fields.
 * Links: Uses EVENT_NAMES registry from events/index.ts; called by routes/features/adapters.
 * @public
 */

import type { Logger } from "pino";
import type { EventBase, EventName } from "../events";

/**
 * Type-safe event logger - enforces event name from registry and base fields.
 * Prevents ad-hoc string event names and schema drift.
 *
 * @param logger - Pino logger instance
 * @param eventName - Event name from EVENT_NAMES registry
 * @param fields - Event-specific fields (MUST include reqId)
 * @param message - Human-readable message (defaults to event name)
 */
export function logEvent(
  logger: Logger,
  eventName: EventName,
  fields: EventBase & Record<string, unknown>,
  message?: string
): void {
  // Enforce reqId presence (throw only in CI/tests, log invariant elsewhere)
  if (!fields.reqId) {
    const isStrict =
      // biome-ignore lint/style/noProcessEnv: Runtime test detection for strict validation
      typeof process !== "undefined" && process.env.VITEST === "true";

    if (isStrict) {
      throw new Error(
        `INVARIANT VIOLATION: logEvent("${eventName}") called without reqId`
      );
    } else {
      // Dev/staging/prod: log invariant but continue (no crashes)
      logger.error(
        { event: eventName, missingField: "reqId" },
        "inv_missing_reqId_in_logEvent"
      );
      return;
    }
  }

  // Default message to event name for consistency
  const msg = message ?? eventName;

  logger.info({ event: eventName, ...fields }, msg);
}
