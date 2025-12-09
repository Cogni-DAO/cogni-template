// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/ai/litellm.usage-service`
 * Purpose: Adapter mapping ActivityUsagePort → UsageService for Activity dashboard range queries.
 * Scope: Delegates to LiteLLM adapter for range-complete log fetching. Does not write to DB.
 * Invariants:
 * - listUsageLogsByRange fetches range-complete data (no silent truncation)
 * - Enforces MAX_LOGS_PER_RANGE (5000) via TooManyLogsError (422)
 * - cost field = providerCostUsd (observational, not user billing)
 * - Pass-through: model, tokens, timestamps from LiteLLM as-is
 * - No local cost recomputation
 * Side-effects: IO (delegates to ActivityUsagePort)
 * Links: [ActivityUsagePort](../../../../ports/usage.port.ts), [UsageService](../../../../ports/usage.port.ts), docs/ACTIVITY_METRICS.md
 * @internal
 */

import type {
  ActivityUsagePort,
  UsageLogEntry,
  UsageLogsByRangeParams,
  UsageLogsParams,
  UsageLogsResult,
  UsageService,
  UsageStatsParams,
  UsageStatsResult,
} from "@/ports";
import { MAX_LOGS_PER_RANGE, TooManyLogsError } from "@/shared/errors";
import { makeLogger } from "@/shared/observability";

const logger = makeLogger({ component: "LiteLlmUsageServiceAdapter" });

/**
 * Adapter that wraps ActivityUsagePort to implement UsageService interface.
 * P1: Single implementation by design. Throws ActivityUsageUnavailableError on LiteLLM failure.
 * Powers Activity dashboard; distinct from observability telemetry.
 */
export class LiteLlmUsageServiceAdapter implements UsageService {
  constructor(private readonly activityUsagePort: ActivityUsagePort) {}

  async getUsageStats(params: UsageStatsParams): Promise<UsageStatsResult> {
    const { billingAccountId, from, to, groupBy } = params;

    const result = await this.activityUsagePort.getSpendChart(
      billingAccountId,
      {
        from,
        to,
        groupBy,
      }
    );

    // Map UsageTelemetryPort buckets → UsageStatsResult series
    const series = result.buckets.map((bucket) => ({
      bucketStart: bucket.bucketStart,
      spend: bucket.providerCostUsd, // Pass-through (observational, not billing)
      tokens: bucket.tokens,
      requests: bucket.requests,
    }));

    // Calculate totals from buckets
    const totals = series.reduce(
      (acc, bucket) => ({
        spend: (
          Number.parseFloat(acc.spend) + Number.parseFloat(bucket.spend)
        ).toFixed(6),
        tokens: acc.tokens + bucket.tokens,
        requests: acc.requests + bucket.requests,
      }),
      { spend: "0.000000", tokens: 0, requests: 0 }
    );

    return { series, totals };
  }

  async listUsageLogs(params: UsageLogsParams): Promise<UsageLogsResult> {
    const { billingAccountId, limit } = params;

    // LiteLLM /spend/logs has no pagination - use date range filtering
    const now = new Date();
    const from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const result = await this.activityUsagePort.getSpendLogs(billingAccountId, {
      from,
      to: now,
      limit,
    });

    const logs = result.logs.map((log) => ({
      id: log.callId,
      timestamp: log.timestamp,
      model: log.model,
      tokensIn: log.tokensIn,
      tokensOut: log.tokensOut,
      cost: log.providerCostUsd,
    }));

    return { logs };
  }

  /**
   * Fetch ALL logs in date range (for charts/totals).
   * Unlike listUsageLogs (cursor-based for table pagination),
   * this fetches complete log set for [from, to).
   *
   * Invariant: Never silently truncate. Throws TooManyLogsError if exceeded.
   */
  async listUsageLogsByRange(
    params: UsageLogsByRangeParams
  ): Promise<{ logs: UsageLogEntry[] }> {
    const { billingAccountId, from, to } = params;

    // Fetch all logs in range (no limit = all logs)
    const result = await this.activityUsagePort.getSpendLogs(billingAccountId, {
      from,
      to,
      // No limit - get all logs in range
    });

    // Enforce MAX_LOGS_PER_RANGE - fail loud, never silently truncate
    if (result.logs.length > MAX_LOGS_PER_RANGE) {
      logger.warn(
        {
          event: "activity.too_many_logs",
          billingAccountId,
          logCount: result.logs.length,
          maxAllowed: MAX_LOGS_PER_RANGE,
          from: from.toISOString(),
          to: to.toISOString(),
        },
        "Log count exceeds MAX_LOGS_PER_RANGE"
      );
      throw new TooManyLogsError(result.logs.length);
    }

    const logs: UsageLogEntry[] = result.logs.map((log) => ({
      id: log.callId,
      timestamp: log.timestamp,
      model: log.model,
      tokensIn: log.tokensIn,
      tokensOut: log.tokensOut,
      cost: log.providerCostUsd,
    }));

    logger.info(
      {
        billingAccountId,
        fetchedLogCount: logs.length,
        from: from.toISOString(),
        to: to.toISOString(),
      },
      "Fetched logs by range"
    );

    return { logs };
  }
}
