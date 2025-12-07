// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/ai/litellm.usage-service`
 * Purpose: Thin adapter mapping UsageTelemetryPort → UsageService interface.
 * Scope: Allows ActivityService to consume LiteLLM telemetry via existing UsageService port. Does not write to DB.
 * Invariants:
 * - Pass-through telemetry: model, tokens, timestamps from LiteLLM as-is
 * - cost field = providerCostUsd (observational, not user billing - see docs/ACTIVITY_METRICS.md)
 * - No local cost recomputation
 * Side-effects: IO (delegates to UsageTelemetryPort)
 * Links: [UsageTelemetryPort](../../../../ports/usage.port.ts), [UsageService](../../../../ports/usage.port.ts)
 * @internal
 */

import type {
  UsageLogsParams,
  UsageLogsResult,
  UsageService,
  UsageStatsParams,
  UsageStatsResult,
  UsageTelemetryPort,
} from "@/ports";

/**
 * Adapter that wraps UsageTelemetryPort to implement UsageService interface.
 * P1: Single implementation by design. Throws UsageTelemetryUnavailableError on LiteLLM failure.
 */
export class LiteLlmUsageServiceAdapter implements UsageService {
  constructor(private readonly telemetryPort: UsageTelemetryPort) {}

  async getUsageStats(params: UsageStatsParams): Promise<UsageStatsResult> {
    const { billingAccountId, from, to, groupBy } = params;

    const result = await this.telemetryPort.getSpendChart(billingAccountId, {
      from,
      to,
      groupBy,
    });

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
    const { billingAccountId, limit, cursor } = params;

    // Convert UsageLogsParams cursor to UsageTelemetryPort cursor (opaque string)
    let telemetryCursor: string | undefined;
    if (cursor) {
      // Encode cursor as opaque string for LiteLLM
      telemetryCursor = Buffer.from(
        JSON.stringify({
          createdAt: cursor.createdAt.toISOString(),
          id: cursor.id,
        })
      ).toString("base64");
    }

    // Need time range for LiteLLM - use generous default (90 days back)
    const now = new Date();
    const from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const result = await this.telemetryPort.getSpendLogs(billingAccountId, {
      from,
      to: now,
      limit,
      ...(telemetryCursor ? { cursor: telemetryCursor } : {}),
    });

    // Map UsageTelemetryPort logs → UsageLogsResult logs
    const logs = result.logs.map((log) => ({
      id: log.callId,
      timestamp: log.timestamp,
      model: log.model,
      tokensIn: log.tokensIn,
      tokensOut: log.tokensOut,
      cost: log.providerCostUsd, // Pass-through (observational, not billing)
      // metadata is optional, omit if not available
    }));

    // Convert nextCursor back to UsageLogsResult format
    let nextCursor: UsageLogsResult["nextCursor"];
    if (result.nextCursor) {
      try {
        const decoded = JSON.parse(
          Buffer.from(result.nextCursor, "base64").toString("utf-8")
        ) as { createdAt: string; id: string };
        nextCursor = {
          createdAt: new Date(decoded.createdAt),
          id: decoded.id,
        };
      } catch {
        // If cursor format doesn't match, use last log as cursor
        const lastLog = logs[logs.length - 1];
        if (lastLog) {
          nextCursor = {
            createdAt: lastLog.timestamp,
            id: lastLog.id,
          };
        }
      }
    }

    return { logs, ...(nextCursor ? { nextCursor } : {}) };
  }
}
