// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/observability/logging/logger`
 * Purpose: Pino logger factory - JSON-only stdout emission.
 * Scope: Create configured pino loggers. Does not handle request-scoped logging.
 * Invariants: Always emits JSON to stdout; no worker transports; env label added by Alloy.
 * Side-effects: none
 * Notes: Use makeLogger for app logger; use makeNoopLogger for tests. Formatting via external pipe (pino-pretty).
 * Links: Initializes redaction paths via REDACT_PATHS; used by container and route handlers.
 * @public
 */

import type { Logger } from "pino";
import pino from "pino";

import { serverEnv } from "@/shared/env";
import { REDACT_PATHS } from "./redact";

export type { Logger } from "pino";

export function makeLogger(bindings?: Record<string, unknown>): Logger {
  // biome-ignore lint/style/noProcessEnv: Test-runner detection only (before serverEnv available)
  const isVitest = process.env.VITEST === "true";
  const env = serverEnv();

  // Silence logs in test tooling (VITEST or NODE_ENV=test) regardless of APP_ENV
  const isTestTooling = isVitest || env.NODE_ENV === "test";

  const config = {
    level: env.PINO_LOG_LEVEL,
    enabled: !isTestTooling,
    // Stable base: bindings first, then reserved keys (prevents overwrite)
    // env label added by Alloy from DEPLOY_ENVIRONMENT, not in app logs
    base: { ...bindings, app: "cogni-template", service: env.SERVICE_NAME },
    messageKey: "msg",
    timestamp: pino.stdTimeFunctions.isoTime, // RFC3339 format (matches Alloy stage.timestamp)
    redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
  };

  // Always emit JSON to stdout (fd 1)
  // Sync in dev for immediate crash visibility, async in prod for performance
  // Formatting happens externally (pipe to pino-pretty if desired)
  return pino(
    config,
    pino.destination({
      dest: 1,
      sync: env.NODE_ENV !== "production",
      minLength: 4096,
    })
  );
}

/**
 * For tests - pino with enabled:false (preserves type, silences output)
 */
export function makeNoopLogger(): Logger {
  return pino({ enabled: false });
}
