// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/observability/server/metrics`
 * Purpose: Prometheus metrics registry and metric definitions for observability.
 * Scope: Shared observability singleton. Provides metrics registry and recording helpers. Does not implement HTTP transport or scrape endpoints.
 * Invariants: Single registry per process via globalThis; labels always low-cardinality; survives HMR.
 * Side-effects: global (module-scoped registry via globalThis)
 * Notes: Uses getOrCreate pattern to prevent duplicate registration errors during HMR/tests.
 * Links: Consumed by route handlers and features; exposed via /api/metrics endpoint.
 * @public
 */

import type { Counter, Histogram, Registry } from "prom-client";
import client from "prom-client";

// Singleton via globalThis to survive HMR/test reloads
const globalForMetrics = globalThis as typeof globalThis & {
  metricsRegistry?: Registry;
  metricsInitialized?: boolean;
};

export const metricsRegistry: Registry =
  globalForMetrics.metricsRegistry ?? new client.Registry();

if (!globalForMetrics.metricsInitialized) {
  globalForMetrics.metricsRegistry = metricsRegistry;
  globalForMetrics.metricsInitialized = true;

  metricsRegistry.setDefaultLabels({
    app: "cogni-template",
    // biome-ignore lint/style/noProcessEnv: Module-level init runs before serverEnv() available
    env: process.env.DEPLOY_ENVIRONMENT ?? "local",
  });
  client.collectDefaultMetrics({ register: metricsRegistry });
}

// =============================================================================
// Metric Factory Helpers (prevent duplicate registration)
// =============================================================================

function getOrCreateCounter<T extends string>(
  name: string,
  help: string,
  labelNames: readonly T[] = [] as readonly T[]
): Counter<T> {
  const existing = metricsRegistry.getSingleMetric(name);
  if (existing) return existing as Counter<T>;
  return new client.Counter({
    name,
    help,
    labelNames: labelNames as T[],
    registers: [metricsRegistry],
  });
}

function getOrCreateHistogram<T extends string>(
  name: string,
  help: string,
  labelNames: readonly T[] = [] as readonly T[],
  buckets: number[]
): Histogram<T> {
  const existing = metricsRegistry.getSingleMetric(name);
  if (existing) return existing as Histogram<T>;
  return new client.Histogram({
    name,
    help,
    labelNames: labelNames as T[],
    buckets,
    registers: [metricsRegistry],
  });
}

// =============================================================================
// HTTP Metrics
// =============================================================================

export const httpRequestsTotal = getOrCreateCounter(
  "http_requests_total",
  "Total number of HTTP requests",
  ["route", "method", "status"] as const
);

export const httpRequestDurationMs = getOrCreateHistogram(
  "http_request_duration_ms",
  "HTTP request duration in milliseconds",
  ["route", "method"] as const,
  [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]
);

// =============================================================================
// AI Chat Streaming Metrics
// =============================================================================

export const aiChatStreamDurationMs = getOrCreateHistogram(
  "ai_chat_stream_duration_ms",
  "AI chat stream duration in milliseconds (from response_started to stream_closed)",
  [] as const,
  [100, 500, 1000, 2500, 5000, 10000, 30000, 60000]
);

// =============================================================================
// AI LLM Call Metrics
// =============================================================================

export const aiLlmCallDurationMs = getOrCreateHistogram(
  "ai_llm_call_duration_ms",
  "AI LLM call duration in milliseconds",
  ["provider", "model_class"] as const,
  [100, 500, 1000, 2500, 5000, 10000, 30000, 60000]
);

export const aiLlmTokensTotal = getOrCreateCounter(
  "ai_llm_tokens_total",
  "Total tokens used in LLM calls",
  ["provider", "model_class"] as const
);

export const aiLlmCostUsdTotal = getOrCreateCounter(
  "ai_llm_cost_usd_total",
  "Total cost in USD for LLM calls",
  ["provider", "model_class"] as const
);

// =============================================================================
// AI LLM Error Metrics (alertable)
// =============================================================================

/**
 * Error codes for LLM failures (low cardinality).
 * Used for alerting on provider issues.
 */
export type LlmErrorCode =
  | "timeout"
  | "rate_limit"
  | "provider_error"
  | "abort"
  | "unknown";

export const aiLlmErrorsTotal = getOrCreateCounter(
  "ai_llm_errors_total",
  "Total LLM call errors by type",
  ["provider", "code", "model_class"] as const
);

// =============================================================================
// Public API Metrics
// =============================================================================

export const publicRateLimitExceededTotal = getOrCreateCounter(
  "public_rate_limit_exceeded_total",
  "Public API rate limit violations (aggregated, no PII)",
  ["route", "env"] as const
);

// =============================================================================
// Helpers
// =============================================================================

/**
 * Map HTTP status code to bucket for low-cardinality label.
 * Returns '2xx', '4xx', or '5xx'.
 */
export function statusBucket(status: number): "2xx" | "4xx" | "5xx" {
  if (status >= 200 && status < 300) return "2xx";
  if (status >= 400 && status < 500) return "4xx";
  return "5xx";
}

/**
 * Classify LLM error into low-cardinality error code.
 */
export function classifyLlmError(error: unknown): LlmErrorCode {
  if (error instanceof Error) {
    if (error.name === "AbortError") return "abort";
    if (error.message.includes("timeout")) return "timeout";
    if (error.message.includes("429")) return "rate_limit";
    if (error.message.includes("LiteLLM")) return "provider_error";
  }
  return "unknown";
}
