// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/observability/clientLogger`
 * Purpose: Provides client-side structured logging with safe defaults and environment-aware output.
 * Scope: Exports debug/info/warn/error functions for browser-side logging with scrubbing and truncation. Does not send logs to backend or implement telemetry pipeline.
 * Invariants: Drops forbidden keys (prompt, messages, apiKey, etc.); truncates large strings/arrays; serialization never throws (fail-closed).
 * Side-effects: IO
 * Notes: MVP implementation - no network shipping. Uses fast-safe-stringify for circular refs. Entire safeJson function wrapped in try-catch for defensive error handling.
 * Links: Replace all client-side console.* calls with this logger.
 * @public
 */

import safeStringify from "fast-safe-stringify";

/** Forbidden keys to DROP from log metadata (lowercase for comparison) */
const FORBIDDEN_KEYS = new Set([
  "prompt",
  "messages",
  "apikey",
  "authorization",
  "cookie",
  "set-cookie",
]);

/** Maximum size for a single meta value before truncation */
const MAX_VALUE_SIZE = 2048;

/** Truncate marker */
const TRUNCATED = "[TRUNCATED]";

/**
 * Shallow scrub and truncate metadata, then safely stringify
 */
function safeJson(meta: Record<string, unknown> | undefined): string {
  if (!meta) return "{}";

  try {
    const scrubbed: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(meta)) {
      // DROP forbidden keys entirely
      if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
        continue;
      }

      // Truncate large strings
      if (typeof value === "string" && value.length > MAX_VALUE_SIZE) {
        scrubbed[key] = `${value.slice(0, MAX_VALUE_SIZE)}${TRUNCATED}`;
        continue;
      }

      // Truncate large arrays
      if (Array.isArray(value) && value.length > 100) {
        scrubbed[key] = [...value.slice(0, 100), TRUNCATED];
        continue;
      }

      scrubbed[key] = value;
    }

    // Use OSS safe-stringify for circular reference handling
    return safeStringify(scrubbed);
  } catch {
    return '"SERIALIZATION_FAILED"';
  }
}

/**
 * Determine if we're in development mode
 */
function isDev(): boolean {
  return (
    typeof process !== "undefined" && process.env.NODE_ENV === "development"
  );
}

/**
 * Debug-level logging (verbose, dev-only)
 * In production: no-op
 * In development: outputs to console
 */
export function debug(event: string, meta?: Record<string, unknown>): void {
  if (!isDev()) return;

  const metaStr = safeJson(meta);
  console.debug(`[CLIENT] DEBUG ${event}`, metaStr);
}

/**
 * Info-level logging (informational, dev-only)
 * In production: no-op
 * In development: outputs to console
 */
export function info(event: string, meta?: Record<string, unknown>): void {
  if (!isDev()) return;

  const metaStr = safeJson(meta);
  console.info(`[CLIENT] INFO ${event}`, metaStr);
}

/**
 * Warning-level logging (non-critical issues)
 * In production: outputs to console
 * In development: outputs to console with structured format
 */
export function warn(event: string, meta?: Record<string, unknown>): void {
  const metaStr = safeJson(meta);
  console.warn(`[CLIENT] WARN ${event}`, metaStr);
}

/**
 * Error-level logging (critical issues)
 * In production: outputs to console
 * In development: outputs to console with structured format
 */
export function error(event: string, meta?: Record<string, unknown>): void {
  const metaStr = safeJson(meta);
  console.error(`[CLIENT] ERROR ${event}`, metaStr);
}
