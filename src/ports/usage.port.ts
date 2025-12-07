// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@ports/usage`
 * Purpose: Interface for fetching usage statistics and logs.
 * Scope: Defines interface for usage data retrieval. Does not implement storage.
 * Invariants:
 * - UsageStatsResult.series must be zero-filled.
 * - Money fields (spend/cost) are decimal strings (6 decimal places).
 * - UsageLogsResult.nextCursor is opaque.
 * - P1: LiteLLM is the single telemetry source. No fallback, no telemetrySource field.
 * - Spend = our billing (charged_credits), telemetry = LiteLLM (model/tokens/timestamps).
 * Side-effects: none
 * Links: [LiteLlmUsageAdapter](../adapters/server/ai/litellm.usage.adapter.ts), docs/ACTIVITY_METRICS.md
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
 * LiteLLM usage adapter port - read-only telemetry from /spend/logs.
 * P1: Single source for model, tokens, timestamps. Never writes to DB.
 * Spend (cost to user) comes from local charged_credits, not this adapter.
 */
export interface LiteLlmUsagePort {
  /**
   * Query LiteLLM /spend/logs with bounded pagination.
   * @param billingAccountId - Server-derived identity (never client-provided)
   * @param params - Time range and pagination params
   * @throws LiteLlmUnavailableError if LiteLLM is down/unreachable
   */
  getSpendLogs(
    billingAccountId: string,
    params: {
      from: Date;
      to: Date;
      limit?: number; // Max 100, enforced by adapter
      cursor?: string; // Opaque pagination token
    }
  ): Promise<{
    logs: Array<{
      /** LiteLLM call ID for forensic correlation */
      callId: string;
      /** Timestamp of the request */
      timestamp: Date;
      /** Model name from LiteLLM (pass-through) */
      model: string;
      /** Input tokens from LiteLLM (pass-through) */
      tokensIn: number;
      /** Output tokens from LiteLLM (pass-through) */
      tokensOut: number;
      /** Provider cost in USD from LiteLLM (observational, not user-facing spend) */
      providerCostUsd: string;
    }>;
    nextCursor?: string;
    /** Warns if pagination was capped at MAX_PAGES */
    paginationCapped?: boolean;
  }>;

  /**
   * Query LiteLLM /spend/logs with daily aggregation.
   * @param billingAccountId - Server-derived identity
   * @param params - Time range and grouping
   * @throws LiteLlmUnavailableError if LiteLLM is down/unreachable
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
      /** Provider cost from LiteLLM (not user-facing spend) */
      providerCostUsd: string;
      tokens: number;
      requests: number;
    }>;
  }>;
}
