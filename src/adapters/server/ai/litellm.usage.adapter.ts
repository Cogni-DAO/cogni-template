// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/ai/litellm.usage`
 * Purpose: LiteLLM implementation of UsageTelemetryPort (read-only).
 * Scope: Queries LiteLLM /spend/logs API for usage telemetry. Does not write to any DB.
 * Invariants:
 * - Identity: billingAccountId is server-derived, passed as end_user to LiteLLM /spend/logs
 * - Bounded pagination: MAX_PAGES=10, limit≤100 enforced
 * - Pass-through: model, tokens, cost from LiteLLM as-is (no local recomputation)
 * - Read-only: never writes to DB or calls recordChargeReceipt
 * Side-effects: IO (HTTP requests to LiteLLM)
 * Links: [UsageTelemetryPort](../../../../ports/usage.port.ts), docs/ACTIVITY_METRICS.md
 * @internal
 */

import type { UsageTelemetryPort } from "@/ports";
import { UsageTelemetryUnavailableError } from "@/ports";
import { serverEnv } from "@/shared/env/server";
import { EVENT_NAMES, makeLogger } from "@/shared/observability";

const logger = makeLogger({ component: "LiteLlmUsageAdapter" });

const MAX_PAGES = 10;
const MAX_LIMIT = 100;

/**
 * Format Date to YYYY-MM-DD for LiteLLM API.
 * LiteLLM /spend/logs expects simple date format, not ISO 8601.
 */
function formatDateForLiteLlm(date: Date): string {
  const iso = date.toISOString();
  return iso.slice(0, 10); // YYYY-MM-DD (always present in ISO string)
}

/**
 * LiteLLM usage adapter - read-only telemetry from /spend/logs.
 * P1: Single implementation by design. Throws UsageTelemetryUnavailableError on failure.
 */
export class LiteLlmUsageAdapter implements UsageTelemetryPort {
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
      cursor?: string;
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
    nextCursor?: string;
    paginationCapped?: boolean;
  }> {
    const limit = Math.min(params.limit ?? 100, MAX_LIMIT);
    const url = new URL(`${this.baseUrl}/spend/logs`);

    // Identity: server-derived billingAccountId as end_user
    // LiteLLM stores the `user` param from completion requests as `end_user` in spend logs
    url.searchParams.set("end_user", billingAccountId);
    url.searchParams.set("start_date", formatDateForLiteLlm(params.from));
    url.searchParams.set("end_date", formatDateForLiteLlm(params.to));
    url.searchParams.set("limit", String(limit));

    if (params.cursor) {
      url.searchParams.set("cursor", params.cursor);
    }

    const logs: Array<{
      callId: string;
      timestamp: Date;
      model: string;
      tokensIn: number;
      tokensOut: number;
      providerCostUsd: string;
    }> = [];

    let currentCursor: string | undefined = params.cursor;
    let pagesConsumed = 0;
    let paginationCapped = false;

    // Bounded pagination loop
    while (pagesConsumed < MAX_PAGES) {
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
              limit,
              page: pagesConsumed,
            },
            EVENT_NAMES.ADAPTER_LITELLM_USAGE_ERROR
          );

          // Only treat infra-ish errors as 'unavailable' (503 to client)
          if ([502, 503, 504].includes(response.status)) {
            throw new UsageTelemetryUnavailableError(
              `LiteLLM /spend/logs unavailable: ${response.status}`,
              new Error(`${response.status} ${response.statusText}`)
            );
          }
          // Everything else is a logic/config bug → normal error → 500
          throw new Error(
            `LiteLLM /spend/logs failed: ${response.status} ${response.statusText}`
          );
        }

        // biome-ignore lint/suspicious/noExplicitAny: External API response
        const data = (await response.json()) as any;

        // Map LiteLLM response to our DTOs (pass-through, no recomputation)
        // biome-ignore lint/suspicious/noExplicitAny: External API response
        const pageLogs = (data.logs ?? []).map((log: any) => ({
          callId: log.request_id ?? log.id ?? "",
          timestamp: new Date(log.startTime ?? log.created_at ?? Date.now()),
          model: log.model ?? "unknown",
          tokensIn: Number(log.prompt_tokens ?? 0),
          tokensOut: Number(log.completion_tokens ?? 0),
          providerCostUsd: String(log.spend ?? "0"),
        }));

        logs.push(...pageLogs);

        // Check for next page
        currentCursor = data.next_cursor ?? data.nextCursor;
        if (!currentCursor) {
          break; // No more pages
        }

        pagesConsumed++;
        url.searchParams.set("cursor", currentCursor);
      } catch (error) {
        // Re-throw known error types as-is
        if (error instanceof UsageTelemetryUnavailableError) {
          throw error;
        }

        // Log network/parsing errors
        logger.error(
          {
            event: EVENT_NAMES.ADAPTER_LITELLM_USAGE_ERROR,
            path: "/spend/logs",
            method: "getSpendLogs",
            userId: billingAccountId,
            errorType: error instanceof Error ? error.name : "unknown",
            errorMessage:
              error instanceof Error ? error.message : String(error),
            limit,
            page: pagesConsumed,
          },
          EVENT_NAMES.ADAPTER_LITELLM_USAGE_ERROR
        );
        if (error instanceof Error && error.message.startsWith("LiteLLM")) {
          throw error; // Config/logic error, not infra
        }
        // Network failures → wrap as unavailable
        throw new UsageTelemetryUnavailableError(
          `Failed to fetch usage logs from LiteLLM`,
          error instanceof Error ? error : new Error(String(error))
        );
      }
    }

    // Warn if we hit MAX_PAGES
    if (pagesConsumed >= MAX_PAGES && currentCursor) {
      paginationCapped = true;
      // TODO: Add structured logging when logger is available
    }

    return {
      logs,
      ...(currentCursor ? { nextCursor: currentCursor } : {}),
      ...(paginationCapped ? { paginationCapped } : {}),
    };
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
    url.searchParams.set("end_date", formatDateForLiteLlm(params.to));
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
          throw new UsageTelemetryUnavailableError(
            `LiteLLM /spend/logs unavailable: ${response.status}`,
            new Error(`${response.status} ${response.statusText}`)
          );
        }
        // Everything else is a logic/config bug → normal error → 500
        throw new Error(
          `LiteLLM /spend/logs failed: ${response.status} ${response.statusText}`
        );
      }

      // biome-ignore lint/suspicious/noExplicitAny: External API response
      const data = (await response.json()) as any;

      // Map LiteLLM aggregated response to our DTOs (pass-through)
      // biome-ignore lint/suspicious/noExplicitAny: External API response
      const buckets = (data.buckets ?? []).map((bucket: any) => ({
        bucketStart: new Date(bucket.time ?? bucket.date ?? Date.now()),
        providerCostUsd: String(bucket.spend ?? bucket.cost ?? "0"),
        tokens: Number(
          (bucket.prompt_tokens ?? 0) + (bucket.completion_tokens ?? 0)
        ),
        requests: Number(bucket.requests ?? bucket.count ?? 0),
      }));

      return { buckets };
    } catch (error) {
      // Re-throw known error types as-is
      if (error instanceof UsageTelemetryUnavailableError) {
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
      throw new UsageTelemetryUnavailableError(
        `Failed to fetch usage chart from LiteLLM`,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }
}
