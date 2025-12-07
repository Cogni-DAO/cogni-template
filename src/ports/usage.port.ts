// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@ports/usage`
 * Purpose: Interface for fetching usage statistics and logs.
 * Scope: Defines interface for usage data retrieval. Does not implement storage.
 * Invariants:
 * - UsageStatsResult.series must be zero-filled.
 * - Money fields are decimal strings (6 decimal places).
 * - UsageLogsResult.nextCursor is opaque.
 * - telemetrySource indicates data origin: "litellm" (P1) or "fallback" (local receipts).
 * Side-effects: none
 * Links: [DrizzleUsageAdapter](../adapters/server/accounts/drizzle.usage.adapter.ts), docs/ACTIVITY_METRICS.md
 * @public
 */

/**
 * Indicates the source of telemetry data.
 * - "litellm": Data from LiteLLM spend logs (canonical, P1)
 * - "fallback": Data from local charge receipts (degraded, no model/tokens)
 */
export type TelemetrySource = "litellm" | "fallback";

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
  /** Source of telemetry data */
  telemetrySource: TelemetrySource;
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
  /** Source of telemetry data */
  telemetrySource: TelemetrySource;
}

export interface UsageService {
  getUsageStats(params: UsageStatsParams): Promise<UsageStatsResult>;
  listUsageLogs(params: UsageLogsParams): Promise<UsageLogsResult>;
}
