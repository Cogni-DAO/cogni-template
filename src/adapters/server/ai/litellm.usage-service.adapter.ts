// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/ai/litellm.usage-service`
 * Purpose: Thin adapter mapping ActivityUsagePort → UsageService interface.
 * Scope: Allows ActivityService to consume LiteLLM usage logs via existing UsageService port. Does not write to DB.
 * Invariants:
 * - Pass-through data: model, tokens, timestamps from LiteLLM as-is
 * - cost field = providerCostUsd (observational, not user billing - see docs/ACTIVITY_METRICS.md)
 * - No local cost recomputation
 * Side-effects: IO (delegates to ActivityUsagePort)
 * Links: [ActivityUsagePort](../../../../ports/usage.port.ts), [UsageService](../../../../ports/usage.port.ts)
 * Note: Distinct from observability/metrics telemetry; powers Activity dashboard.
 * @internal
 */

import type {
  ActivityUsagePort,
  UsageLogsParams,
  UsageLogsResult,
  UsageService,
  UsageStatsParams,
  UsageStatsResult,
} from "@/ports";

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
}
