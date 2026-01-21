// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/scheduler-worker-service/logger`
 * Purpose: Pino logger factory - JSON-only stdout emission.
 * Scope: Create configured pino loggers. Does not handle request-scoped logging.
 * Invariants: Always emits JSON to stdout; no worker transports; env label added by Alloy.
 * Side-effects: none
 * Notes: Duplicated from src/shared/observability/server/logger.ts until @cogni/logging package exists.
 * Notes: Use makeLogger for service logger; formatting via external pipe (pino-pretty).
 * Links: Initializes redaction paths via REDACT_PATHS.
 * @internal
 */

import type { DestinationStream, Logger } from "pino";
import pino from "pino";

import { REDACT_PATHS } from "./redact.js";

export type { Logger } from "pino";

let destination: DestinationStream | null = null;

export function makeLogger(bindings?: Record<string, unknown>): Logger {
  const logLevel = process.env.LOG_LEVEL ?? "info";
  const serviceName = process.env.SERVICE_NAME ?? "scheduler-worker";

  const config = {
    level: logLevel,
    // Stable base: bindings first, then reserved keys (prevents overwrite)
    // env label added by Alloy from DEPLOY_ENVIRONMENT, not in app logs
    base: { ...bindings, app: "cogni-template", service: serviceName },
    messageKey: "msg",
    timestamp: pino.stdTimeFunctions.isoTime, // RFC3339 format
    redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
  };

  // Always emit JSON to stdout (fd 1)
  // Sync mode + zero buffering (prevents delayed/missing logs)
  destination = pino.destination({
    dest: 1,
    sync: true,
    minLength: 0,
  });

  return pino(config, destination);
}

/**
 * Flush logger destination before exit to prevent log loss.
 * Call this before process.exit() in shutdown handlers.
 */
export function flushLogger(): void {
  if (destination && "flushSync" in destination) {
    (destination as { flushSync: () => void }).flushSync();
  }
}
