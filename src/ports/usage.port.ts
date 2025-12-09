// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@ports/usage`
 * Purpose: Interface for fetching usage statistics and logs for the Activity dashboard.
 * Scope: Defines interface for usage data retrieval. Does not implement storage.
 * Invariants:
 * - UsageStatsResult.series must be zero-filled.
 * - Money fields (spend/cost) are decimal strings (6 decimal places).
 * - UsageLogsResult.nextCursor is opaque.
 * - P1: LiteLLM is the single usage log source. No fallback, no telemetrySource field.
 * - Spend = our billing (charged_credits), usage logs = LiteLLM (model/tokens/timestamps).
 * Side-effects: none
 * Links: [LiteLlmActivityUsageAdapter](../adapters/server/ai/litellm.activity-usage.adapter.ts), docs/ACTIVITY_METRICS.md
 * Port naming: ActivityUsagePort is for Activity dashboard, distinct from observability/metrics telemetry.
 * @public
 */

export interface UsageStatsParams {
  billingAccountId: string;
  from: Date;
  to: Date;
  groupBy: "day" | "hour";
}

export interface UsageBucket {
  bucketStart: Date;
  spend: string; // Decimal string
  tokens: number;
  requests: number;
}

export interface UsageStatsResult {
  series: UsageBucket[];
  totals: {
    spend: string;
    tokens: number;
    requests: number;
  };
}

export interface UsageLogsParams {
  billingAccountId: string;
  limit: number;
  cursor?: {
    createdAt: Date;
    id: string;
  };
}

export interface UsageLogsByRangeParams {
  billingAccountId: string;
  from: Date;
  to: Date;
  limit?: number; // Optional limit (default adapter-specific)
}

export interface UsageLogEntry {
  id: string;
  timestamp: Date;
  model: string;
  tokensIn: number;
  tokensOut: number;
  cost: string; // Decimal string
  metadata?: Record<string, unknown>;
}

export interface UsageLogsResult {
  logs: UsageLogEntry[];
  nextCursor?: {
    createdAt: Date;
    id: string;
  };
}

export interface UsageService {
  getUsageStats(params: UsageStatsParams): Promise<UsageStatsResult>;
  listUsageLogs(params: UsageLogsParams): Promise<UsageLogsResult>;
}

/**
 * Usage log port - read-only usage logs from external usage tracking system.
 * P1: Single implementation (LiteLLM) by design. Single source for model, tokens, timestamps.
 * Powers the Activity dashboard. Distinct from observability/metrics telemetry (Grafana, Prometheus).
 * Never writes to DB. Spend (cost to user) comes from local charged_credits, not this port.
 */
export interface ActivityUsagePort {
  /**
   * Query usage logs by date range.
   * @param billingAccountId - Server-derived identity (never client-provided)
   * @param params - Time range and limit
   * @throws ActivityUsageUnavailableError if usage log system is down/unreachable
   *
   * Note: /spend/logs is deprecated and has no pagination.
   * If pagination needed, migrate to /spend/logs/v2 with page/page_size params.
   */
  getSpendLogs(
    billingAccountId: string,
    params: {
      from: Date;
      to: Date;
      limit?: number; // Max 100, enforced by adapter
    }
  ): Promise<{
    logs: Array<{
      /** Call ID for forensic correlation */
      callId: string;
      /** Timestamp of the request */
      timestamp: Date;
      /** Model name (pass-through from telemetry system) */
      model: string;
      /** Input tokens (pass-through from telemetry system) */
      tokensIn: number;
      /** Output tokens (pass-through from telemetry system) */
      tokensOut: number;
      /** Provider cost in USD (observational, not user-facing spend) */
      providerCostUsd: string;
    }>;
  }>;

  /**
   * Query usage chart with time-based aggregation.
   * @param billingAccountId - Server-derived identity
   * @param params - Time range and grouping
   * @throws ActivityUsageUnavailableError if usage log system is down/unreachable
   */
  getSpendChart(
    billingAccountId: string,
    params: {
      from: Date;
      to: Date;
      groupBy: "day" | "hour";
    }
  ): Promise<{
    buckets: Array<{
      bucketStart: Date;
      /** Provider cost from telemetry system (not user-facing spend) */
      providerCostUsd: string;
      tokens: number;
      requests: number;
    }>;
  }>;
}

/**
 * Error thrown when usage log system is unavailable.
 * Maps to 503 Service Unavailable in HTTP layer.
 * Used by Activity dashboard; distinct from observability/metrics errors.
 */
export class ActivityUsageUnavailableError extends Error {
  public override readonly cause: Error | undefined;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = "ActivityUsageUnavailableError";
    this.cause = cause;
  }
}

export function isActivityUsageUnavailableError(
  error: Error
): error is ActivityUsageUnavailableError {
  return error instanceof ActivityUsageUnavailableError;
}
