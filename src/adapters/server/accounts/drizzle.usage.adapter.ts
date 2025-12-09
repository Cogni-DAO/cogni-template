// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/accounts/drizzle.usage`
 * Purpose: DEPRECATED - To be removed in P1. Re-scoped to billing/reconciliation only.
 * Scope: Queries local charge_receipt table. NOT used for activity dashboard (LiteLLM is canonical).
 * Invariants:
 * - Buckets are zero-filled using SQL generate_series.
 * - Money is returned as decimal string (6 decimal places).
 * - Totals are calculated via separate SQL query for precision.
 * - Cursor is opaque base64-encoded string.
 * - P1: DO NOT call from ActivityService. Use LiteLlmUsagePort instead.
 * Side-effects: IO
 * Links: [UsageService](../../../../ports/usage.port.ts), docs/ACTIVITY_METRICS.md
 * @internal
 * @deprecated P1: Use LiteLlmUsagePort for activity. This adapter is for billing/reconciliation only.
 */

import { and, desc, eq, gte, lt, sql } from "drizzle-orm";

import type { Database } from "@/adapters/server/db/client";
import type {
  UsageBucket,
  UsageLogEntry,
  UsageLogsParams,
  UsageLogsResult,
  UsageService,
  UsageStatsParams,
  UsageStatsResult,
} from "@/ports";
import { chargeReceipts } from "@/shared/db";

export class DrizzleUsageAdapter implements UsageService {
  constructor(private readonly db: Database) {}

  async getUsageStats(params: UsageStatsParams): Promise<UsageStatsResult> {
    const { billingAccountId, from, to, groupBy } = params;

    // 1. Generate time series and aggregate in SQL
    // Using generate_series ensures we get all buckets including empty ones
    // and handles timezones correctly within the database.
    // NOTE: Fallback mode - no tokens available (LiteLLM is canonical per ACTIVITY_METRICS.md)
    const interval = groupBy === "day" ? "1 day" : "1 hour";

    // We need to cast the interval to interval type for generate_series
    const seriesQuery = sql`
      SELECT
        series.bucket_start as "bucketStart",
        COALESCE(SUM(${chargeReceipts.responseCostUsd}::numeric), 0)::decimal(10, 6)::text as spend,
        0 as tokens,
        COUNT(${chargeReceipts.id}) as requests
      FROM generate_series(
        date_trunc(${groupBy}, ${from.toISOString()}::timestamptz),
        date_trunc(${groupBy}, ${to.toISOString()}::timestamptz - interval '1 second'),
        ${interval}::interval
      ) as series(bucket_start)
      LEFT JOIN ${chargeReceipts} ON (
        ${chargeReceipts.billingAccountId} = ${billingAccountId} AND
        ${chargeReceipts.createdAt} >= ${from.toISOString()}::timestamp AND
        ${chargeReceipts.createdAt} < ${to.toISOString()}::timestamp AND
        date_trunc(${groupBy}, ${chargeReceipts.createdAt} AT TIME ZONE 'UTC') = series.bucket_start
      )
      GROUP BY series.bucket_start
      ORDER BY series.bucket_start
    `;

    const rows = await this.db.execute(seriesQuery);

    // biome-ignore lint/suspicious/noExplicitAny: Raw SQL result
    const series: UsageBucket[] = rows.map((row: any) => ({
      bucketStart: new Date(row.bucketStart),
      spend: row.spend, // Already string from SQL
      tokens: 0, // Not available in fallback mode
      requests: Number(row.requests),
    }));

    // 2. Calculate totals with a separate query to ensure precision
    const [totalsRow] = await this.db
      .select({
        spend: sql<string>`coalesce(sum(${chargeReceipts.responseCostUsd}::numeric), 0)::decimal(10, 6)::text`,
        requests: sql<number>`count(*)`,
      })
      .from(chargeReceipts)
      .where(
        and(
          eq(chargeReceipts.billingAccountId, billingAccountId),
          gte(chargeReceipts.createdAt, from),
          lt(chargeReceipts.createdAt, to)
        )
      );

    return {
      series,
      totals: {
        spend: totalsRow?.spend ?? "0.000000",
        tokens: 0, // Not available in local receipts
        requests: Number(totalsRow?.requests ?? 0),
      },
    };
  }

  async listUsageLogs(params: UsageLogsParams): Promise<UsageLogsResult> {
    const { billingAccountId, limit, cursor } = params;

    // Keyset pagination: (createdAt, id) < (cursorTime, cursorId)
    // Order: createdAt DESC, id DESC
    // NOTE: Fallback mode - no model/tokens available (LiteLLM is canonical per ACTIVITY_METRICS.md)
    const where = cursor
      ? and(
          eq(chargeReceipts.billingAccountId, billingAccountId),
          sql`(${chargeReceipts.createdAt}, ${chargeReceipts.id}) < (${cursor.createdAt.toISOString()}::timestamp, ${cursor.id})`
        )
      : eq(chargeReceipts.billingAccountId, billingAccountId);

    const rows = await this.db
      .select({
        id: chargeReceipts.id,
        createdAt: chargeReceipts.createdAt,
        responseCostUsd: chargeReceipts.responseCostUsd,
      })
      .from(chargeReceipts)
      .where(where)
      .orderBy(desc(chargeReceipts.createdAt), desc(chargeReceipts.id))
      .limit(limit);

    // Return degraded log entries per ACTIVITY_METRICS.md fallback mode
    const logs: UsageLogEntry[] = rows.map((row) => ({
      id: row.id,
      timestamp: row.createdAt,
      model: "unavailable", // Not stored in charge receipts
      tokensIn: 0, // Not stored in charge receipts
      tokensOut: 0, // Not stored in charge receipts
      cost: row.responseCostUsd ?? "0",
    }));

    let nextCursor: { createdAt: Date; id: string } | undefined;
    if (logs.length > 0) {
      const last = logs[logs.length - 1];
      if (last) {
        nextCursor = {
          createdAt: last.timestamp,
          id: last.id,
        };
      }
    }

    return {
      logs,
      ...(nextCursor ? { nextCursor } : {}),
    };
  }
}
