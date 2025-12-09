// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/ai/litellm.activity-usage`
 * Purpose: LiteLLM implementation of ActivityUsagePort with bounded range-scan for charts.
 * Scope: Queries LiteLLM /spend/logs without date params (avoids aggregation), filters in-memory. Does not write to DB.
 * Invariants:
 * - Identity: billingAccountId is server-derived, passed as end_user to LiteLLM /spend/logs
 * - No date params: start_date/end_date cause LiteLLM to aggregate, breaking receipt joins
 * - Bounded scan: Fetch up to MAX_RANGE_LIMIT, filter to [from,to), validate completeness
 * - Fail loud: Throws TooManyLogsError (422) if range exceeds MAX_LOGS_PER_RANGE
 * - Pass-through: model, tokens, timestamps from LiteLLM as-is (no recomputation)
 * - Read-only: observational cost only (not user billing)
 * Side-effects: IO (HTTP to LiteLLM /spend/logs)
 * Links: [ActivityUsagePort](../../../../ports/usage.port.ts), docs/ACTIVITY_METRICS.md
 * @internal
 */

import type { ActivityUsagePort } from "@/ports";
import { ActivityUsageUnavailableError } from "@/ports";
import { serverEnv } from "@/shared/env/server";
import { MAX_LOGS_PER_RANGE, TooManyLogsError } from "@/shared/errors";
import { EVENT_NAMES, makeLogger } from "@/shared/observability";
import {
  type LiteLlmSpendBucket,
  LiteLlmSpendBucketsResponseSchema,
  type LiteLlmSpendLog,
  LiteLlmSpendLogsResponseSchema,
} from "@/shared/schemas/litellm.spend-logs.schema";

const logger = makeLogger({ component: "LiteLlmActivityUsageAdapter" });

// Max logs to fetch in a single request (for table pagination)
const MAX_TABLE_LIMIT = 100;
// Max logs for range queries (charts/totals) - aligned with MAX_LOGS_PER_RANGE
const MAX_RANGE_LIMIT = MAX_LOGS_PER_RANGE;

/**
 * Format Date to YYYY-MM-DD for LiteLLM API.
 * LiteLLM /spend/logs expects simple date format, not ISO 8601.
 */
function formatDateForLiteLlm(date: Date): string {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * LiteLLM usage log adapter - read-only usage logs from /spend/logs.
 * P1: Single implementation by design. Throws ActivityUsageUnavailableError on failure.
 * Powers Activity dashboard; distinct from observability telemetry.
 *
 * Note: /spend/logs is deprecated and has no pagination. Use date range filtering.
 * If pagination needed in future, migrate to /spend/logs/v2 with page/page_size params.
 */
export class LiteLlmActivityUsageAdapter implements ActivityUsagePort {
  private get baseUrl(): string {
    return serverEnv().LITELLM_BASE_URL;
  }

  private get masterKey(): string {
    const key = serverEnv().LITELLM_MASTER_KEY;
    if (!key) {
      throw new Error("LITELLM_MASTER_KEY is not configured");
    }
    return key;
  }

  async getSpendLogs(
    billingAccountId: string,
    params: {
      from: Date;
      to: Date;
      limit?: number;
    }
  ): Promise<{
    logs: Array<{
      callId: string;
      timestamp: Date;
      model: string;
      tokensIn: number;
      tokensOut: number;
      providerCostUsd: string;
    }>;
  }> {
    // CRITICAL: Do NOT use start_date/end_date params - they cause LiteLLM to return aggregated buckets
    // (no request_id), which breaks receipt joins and per-log bucketing.
    // Instead: Fetch individual logs (newest first) and filter by timestamp in-memory.
    //
    // Bounded scan strategy:
    // 1. Fetch up to limit (or MAX_LIMIT for range queries)
    // 2. Filter logs to [from, to) by timestamp
    // 3. If fetched == limit AND oldest log > from → incomplete data (422)
    // 4. If fetched < limit OR oldest log <= from → complete data
    const url = new URL(`${this.baseUrl}/spend/logs`);
    url.searchParams.set("end_user", billingAccountId);

    // For range queries (charts/totals): use MAX_RANGE_LIMIT to ensure complete data
    // For table pagination: use provided limit (recent-N), capped at MAX_TABLE_LIMIT
    const fetchLimit = params.limit ?? MAX_RANGE_LIMIT;
    const cappedLimit = params.limit
      ? Math.min(fetchLimit, MAX_TABLE_LIMIT)
      : fetchLimit;
    url.searchParams.set("limit", String(cappedLimit));

    logger.info(
      {
        billingAccountId,
        queryUrl: url.toString(),
        from: params.from.toISOString(),
        to: params.to.toISOString(),
        fetchLimit,
      },
      "LiteLLM activity query (logs)"
    );

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.masterKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        logger.error(
          {
            event: EVENT_NAMES.ADAPTER_LITELLM_USAGE_ERROR,
            path: "/spend/logs",
            method: "getSpendLogs",
            userId: billingAccountId,
            httpStatus: response.status,
            httpStatusText: response.statusText,
          },
          EVENT_NAMES.ADAPTER_LITELLM_USAGE_ERROR
        );

        if ([502, 503, 504].includes(response.status)) {
          throw new ActivityUsageUnavailableError(
            `LiteLLM /spend/logs unavailable: ${response.status}`,
            new Error(`${response.status} ${response.statusText}`)
          );
        }
        throw new Error(
          `LiteLLM /spend/logs failed: ${response.status} ${response.statusText}`
        );
      }

      const rawData: unknown = await response.json();

      // Validate response shape with Zod - fail loud on mismatch
      const parseResult = LiteLlmSpendLogsResponseSchema.safeParse(rawData);
      if (!parseResult.success) {
        logger.error(
          {
            event: EVENT_NAMES.ADAPTER_LITELLM_USAGE_ERROR,
            path: "/spend/logs",
            method: "getSpendLogs",
            userId: billingAccountId,
            zodErrors: parseResult.error.issues,
            responseType: typeof rawData,
            isArray: Array.isArray(rawData),
          },
          "LiteLLM response validation failed"
        );
        throw new ActivityUsageUnavailableError(
          "LiteLLM /spend/logs returned invalid response shape",
          new Error(parseResult.error.message)
        );
      }

      const allLogs = parseResult.data.map((log: LiteLlmSpendLog) => ({
        callId: log.request_id,
        timestamp: new Date(log.startTime),
        model: log.model,
        tokensIn: log.prompt_tokens,
        tokensOut: log.completion_tokens,
        providerCostUsd: log.spend,
      }));

      // Filter to [from, to) range
      const logsInRange = allLogs.filter((log) => {
        return log.timestamp >= params.from && log.timestamp < params.to;
      });

      // Bounded scan validation: Check if we have complete data for the range
      // If we fetched exactly fetchLimit logs AND the oldest is still after 'from',
      // we don't have all logs in [from, to) → fail loud with 422
      if (allLogs.length === fetchLimit && allLogs.length > 0) {
        const oldestFetched = allLogs[allLogs.length - 1];
        if (oldestFetched && oldestFetched.timestamp > params.from) {
          throw new TooManyLogsError(allLogs.length, fetchLimit);
        }
      }

      return { logs: logsInRange };
    } catch (error) {
      if (error instanceof ActivityUsageUnavailableError) {
        throw error;
      }
      if (error instanceof TooManyLogsError) {
        throw error;
      }
      if (error instanceof Error && error.message.startsWith("LiteLLM")) {
        throw error;
      }

      logger.error(
        {
          event: EVENT_NAMES.ADAPTER_LITELLM_USAGE_ERROR,
          path: "/spend/logs",
          method: "getSpendLogs",
          userId: billingAccountId,
          errorType: error instanceof Error ? error.name : "unknown",
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        EVENT_NAMES.ADAPTER_LITELLM_USAGE_ERROR
      );

      throw new ActivityUsageUnavailableError(
        "Failed to fetch usage logs from LiteLLM",
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  async getSpendChart(
    billingAccountId: string,
    params: {
      from: Date;
      to: Date;
      groupBy: "day" | "hour";
    }
  ): Promise<{
    buckets: Array<{
      bucketStart: Date;
      providerCostUsd: string;
      tokens: number;
      requests: number;
    }>;
  }> {
    const url = new URL(`${this.baseUrl}/spend/logs`);

    // Identity: server-derived billingAccountId as end_user
    // LiteLLM stores the `user` param from completion requests as `end_user` in spend logs
    url.searchParams.set("end_user", billingAccountId);
    url.searchParams.set("start_date", formatDateForLiteLlm(params.from));
    // LiteLLM end_date is exclusive - add 1 day to include data from 'to' date
    const toInclusive = new Date(params.to);
    toInclusive.setDate(toInclusive.getDate() + 1);
    url.searchParams.set("end_date", formatDateForLiteLlm(toInclusive));
    url.searchParams.set("group_by", params.groupBy);

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.masterKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        logger.error(
          {
            event: EVENT_NAMES.ADAPTER_LITELLM_USAGE_ERROR,
            path: "/spend/logs",
            method: "getSpendChart",
            userId: billingAccountId,
            httpStatus: response.status,
            httpStatusText: response.statusText,
            groupBy: params.groupBy,
          },
          EVENT_NAMES.ADAPTER_LITELLM_USAGE_ERROR
        );

        // Only treat infra-ish errors as 'unavailable' (503 to client)
        if ([502, 503, 504].includes(response.status)) {
          throw new ActivityUsageUnavailableError(
            `LiteLLM /spend/logs unavailable: ${response.status}`,
            new Error(`${response.status} ${response.statusText}`)
          );
        }
        // Everything else is a logic/config bug → normal error → 500
        throw new Error(
          `LiteLLM /spend/logs failed: ${response.status} ${response.statusText}`
        );
      }

      const rawData: unknown = await response.json();

      // Validate response shape with Zod - fail loud on mismatch
      const parseResult = LiteLlmSpendBucketsResponseSchema.safeParse(rawData);
      if (!parseResult.success) {
        logger.error(
          {
            event: EVENT_NAMES.ADAPTER_LITELLM_USAGE_ERROR,
            path: "/spend/logs",
            method: "getSpendChart",
            userId: billingAccountId,
            zodErrors: parseResult.error.issues,
            responseType: typeof rawData,
            isArray: Array.isArray(rawData),
          },
          "LiteLLM response validation failed"
        );
        throw new ActivityUsageUnavailableError(
          "LiteLLM /spend/logs returned invalid response shape",
          new Error(parseResult.error.message)
        );
      }

      const validatedBuckets: LiteLlmSpendBucket[] = parseResult.data;
      const buckets = validatedBuckets.map((bucket) => {
        // Resolve bucket timestamp from available fields
        const timeStr = bucket.startTime ?? bucket.time ?? bucket.date;
        const bucketStart = timeStr ? new Date(timeStr) : new Date();

        return {
          bucketStart,
          providerCostUsd: bucket.spend ?? bucket.cost ?? "0",
          tokens: (bucket.prompt_tokens ?? 0) + (bucket.completion_tokens ?? 0),
          requests: bucket.requests ?? bucket.count ?? 0,
        };
      });

      return { buckets };
    } catch (error) {
      // Re-throw known error types as-is
      if (error instanceof ActivityUsageUnavailableError) {
        throw error;
      }
      if (error instanceof Error && error.message.startsWith("LiteLLM")) {
        throw error; // Config/logic error, not infra
      }

      // Log network/parsing errors
      logger.error(
        {
          event: EVENT_NAMES.ADAPTER_LITELLM_USAGE_ERROR,
          path: "/spend/logs",
          method: "getSpendChart",
          userId: billingAccountId,
          errorType: error instanceof Error ? error.name : "unknown",
          errorMessage: error instanceof Error ? error.message : String(error),
          groupBy: params.groupBy,
        },
        EVENT_NAMES.ADAPTER_LITELLM_USAGE_ERROR
      );

      // Network failures → wrap as unavailable
      throw new ActivityUsageUnavailableError(
        `Failed to fetch usage chart from LiteLLM`,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }
}
