// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/ai/litellm.activity-usage`
 * Purpose: LiteLLM implementation of ActivityUsagePort (read-only).
 * Scope: Queries LiteLLM /spend/logs API for usage logs. Does not write to any DB.
 * Invariants:
 * - Identity: billingAccountId is server-derived, passed as end_user to LiteLLM /spend/logs
 * - No pagination: /spend/logs deprecated endpoint, use limit only (max 100)
 * - Pass-through: model, tokens, timestamps from LiteLLM as-is (no local recomputation)
 * - Read-only: never writes to DB; observational cost only (not user billing)
 * Side-effects: IO (HTTP requests to LiteLLM)
 * Links: [ActivityUsagePort](../../../../ports/usage.port.ts), docs/ACTIVITY_METRICS.md
 * Note: Distinct from observability/metrics telemetry; powers Activity dashboard only.
 * @internal
 */

import type { ActivityUsagePort } from "@/ports";
import { ActivityUsageUnavailableError } from "@/ports";
import { serverEnv } from "@/shared/env/server";
import { EVENT_NAMES, makeLogger } from "@/shared/observability";
import {
  type LiteLlmSpendBucket,
  LiteLlmSpendBucketsResponseSchema,
  type LiteLlmSpendLog,
  LiteLlmSpendLogsResponseSchema,
} from "@/shared/schemas/litellm.spend-logs.schema";

const logger = makeLogger({ component: "LiteLlmActivityUsageAdapter" });

const MAX_LIMIT = 100;

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
    const limit = Math.min(params.limit ?? 100, MAX_LIMIT);

    // IMPORTANT: Do NOT pass start_date/end_date for individual logs.
    // LiteLLM switches to aggregate mode when date params are present.
    // Logs are fetched by end_user + limit only; filter by date in-memory if needed.
    const url = new URL(`${this.baseUrl}/spend/logs`);
    url.searchParams.set("end_user", billingAccountId);
    url.searchParams.set("limit", String(limit));

    logger.info(
      { billingAccountId, queryUrl: url.toString(), limit },
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

      const logs = parseResult.data.map((log: LiteLlmSpendLog) => ({
        callId: log.request_id,
        timestamp: new Date(log.startTime),
        model: log.model,
        tokensIn: log.prompt_tokens,
        tokensOut: log.completion_tokens,
        providerCostUsd: log.spend,
      }));

      return { logs };
    } catch (error) {
      if (error instanceof ActivityUsageUnavailableError) {
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
