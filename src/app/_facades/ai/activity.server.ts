// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/_facades/ai/activity.server`
 * Purpose: App-layer facade for Activity dashboard with granular time bucketing.
 * Scope: Resolves session user to billing account, fetches range-complete logs, aggregates into buckets. Does not handle HTTP transport.
 * Invariants:
 * - Only app layer imports this; validates billing account.
 * - Fetches ALL logs in [from, to) via listUsageLogsByRange (range-complete, no silent truncation).
 * - Uses epoch-based bucketing (UTC, DST-safe) with server-derived step.
 * - Zero-fills buckets across entire range for continuous charts.
 * - Joins receipts by litellm_call_id (LEFT JOIN), then buckets spend by log.timestamp (not receipt.createdAt).
 * - Logs fetchedLogCount and unjoinedLogCount for observability.
 * Side-effects: IO (via usageService, accountService)
 * Links: [validateActivityRange](../../../features/ai/services/activity.ts), [ai.activity.v1.contract](../../../contracts/ai.activity.v1.contract.ts)
 * @public
 */

import { randomUUID } from "node:crypto";
import type { z } from "zod";

import { resolveActivityDeps } from "@/bootstrap/container";
import {
  type aiActivityOperation,
  STEP_MS,
} from "@/contracts/ai.activity.v1.contract";
import { validateActivityRange } from "@/features/ai/public.server";
import { getOrCreateBillingAccountForUser } from "@/lib/auth/mapping";
import type { SessionUser } from "@/shared/auth";
import {
  type AiActivityQueryCompletedEvent,
  EVENT_NAMES,
  makeLogger,
} from "@/shared/observability";

const logger = makeLogger({ component: "ActivityFacade" });

type ActivityInput = {
  from: string;
  to: string;
  step?: z.infer<typeof aiActivityOperation.input>["step"];
  cursor?: string;
  limit?: number;
  sessionUser: SessionUser;
  /** Optional correlation ID - generated if not provided */
  reqId?: string;
};

type ActivityOutput = z.infer<typeof aiActivityOperation.output>;

/**
 * Compute epoch bucket key for a timestamp.
 * Aligns to UTC boundaries (DST-safe).
 */
function toBucketEpoch(timestamp: Date, stepMs: number): number {
  return Math.floor(timestamp.getTime() / stepMs) * stepMs;
}

/**
 * Generate all bucket epochs in [from, to) range.
 * Returns sorted array of epoch timestamps.
 * Note: Range is [from, to) - inclusive start, exclusive end.
 */
function generateBucketRange(from: Date, to: Date, stepMs: number): number[] {
  const buckets: number[] = [];
  const startBucket = toBucketEpoch(from, stepMs);
  const endBucket = toBucketEpoch(to, stepMs);

  // Use < not <= since range is [from, to) - exclude end bucket
  for (let epoch = startBucket; epoch < endBucket; epoch += stepMs) {
    buckets.push(epoch);
  }
  return buckets;
}

export async function getActivity(
  input: ActivityInput
): Promise<ActivityOutput> {
  const startTime = performance.now();
  const effectiveReqId = input.reqId ?? randomUUID();
  const { usageService, accountService } = resolveActivityDeps();

  const billingAccount = await getOrCreateBillingAccountForUser(
    accountService,
    {
      userId: input.sessionUser.id,
      ...(input.sessionUser.walletAddress
        ? { walletAddress: input.sessionUser.walletAddress }
        : {}),
    }
  );

  // Parse dates once and validate range (derives step if not provided)
  const from = new Date(input.from);
  const to = new Date(input.to);
  const { effectiveStep, diffDays } = validateActivityRange({
    from,
    to,
    step: input.step,
  });

  const stepMs = STEP_MS[effectiveStep];

  // Fetch ALL logs in range for charts/totals (range-complete, no silent truncation)
  // Also fetch receipts for spend join
  const [logsResult, receipts] = await Promise.all([
    usageService.listUsageLogsByRange({
      billingAccountId: billingAccount.id,
      from,
      to,
    }),
    accountService.listChargeReceipts({
      billingAccountId: billingAccount.id,
      from,
      to,
      limit: 10000, // High limit for receipts (should match logs)
    }),
  ]);

  // All logs in range (already filtered by adapter)
  const allLogs = logsResult.logs;
  const fetchedLogCount = allLogs.length;

  // Build join map: litellmCallId → responseCostUsd
  // Activity is usage-driven; charge_receipts adds cost via LEFT JOIN on litellmCallId
  const chargeMap = new Map<string, string>(); // litellmCallId → responseCostUsd (USD)
  for (const receipt of receipts) {
    // Only join LiteLLM-based receipts to LiteLLM usage logs
    if (
      receipt.sourceSystem === "litellm" &&
      receipt.litellmCallId &&
      receipt.responseCostUsd
    ) {
      chargeMap.set(receipt.litellmCallId, receipt.responseCostUsd);
    }
  }

  // Track unjoined logs for observability
  let unjoinedLogCount = 0;
  for (const log of allLogs) {
    if (!chargeMap.has(log.id)) {
      unjoinedLogCount++;
    }
  }

  // Aggregate logs into epoch buckets for tokens/requests
  // Also aggregate spend by log.timestamp (joined from receipts by litellmCallId)
  const buckets = new Map<
    number,
    { tokens: number; requests: number; spend: number }
  >();

  for (const log of allLogs) {
    const bucketEpoch = toBucketEpoch(log.timestamp, stepMs);
    const existing = buckets.get(bucketEpoch) ?? {
      tokens: 0,
      requests: 0,
      spend: 0,
    };

    // Get spend from joined receipt by litellmCallId (if exists)
    const responseCostUsdStr = chargeMap.get(log.id);
    const logSpend = responseCostUsdStr
      ? Number.parseFloat(responseCostUsdStr)
      : 0;

    buckets.set(bucketEpoch, {
      tokens: existing.tokens + log.tokensIn + log.tokensOut,
      requests: existing.requests + 1,
      spend: existing.spend + logSpend,
    });
  }

  // Zero-fill: generate all buckets in range
  const allBucketEpochs = generateBucketRange(from, to, stepMs);
  const chartSeries = allBucketEpochs.map((epoch) => {
    const bucket = buckets.get(epoch) ?? { tokens: 0, requests: 0, spend: 0 };
    return {
      bucketStart: new Date(epoch).toISOString(),
      spend: bucket.spend.toFixed(6),
      tokens: bucket.tokens,
      requests: bucket.requests,
    };
  });

  // Calculate totals from all logs in range
  let totalUserSpend = 0;
  let totalTokens = 0;
  for (const log of allLogs) {
    totalTokens += log.tokensIn + log.tokensOut;
    const responseCostUsdStr = chargeMap.get(log.id);
    if (responseCostUsdStr) {
      totalUserSpend += Number.parseFloat(responseCostUsdStr);
    }
  }
  const totalRequests = allLogs.length;

  const avgDays = Math.max(1, diffDays);

  const totals = {
    spend: {
      total: totalUserSpend.toFixed(6),
      avgDay: (totalUserSpend / avgDays).toFixed(6),
      pastRange: "0",
    },
    tokens: {
      total: totalTokens,
      avgDay: Math.round(totalTokens / avgDays),
      pastRange: 0,
    },
    requests: {
      total: totalRequests,
      avgDay: Math.round(totalRequests / avgDays),
      pastRange: 0,
    },
  };

  // Build rows with user cost from joined receipts
  // Sort by timestamp descending (most recent first) and apply pagination
  const sortedLogs = [...allLogs].sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
  );
  const pageSize = input.limit ?? 20;
  const paginatedLogs = sortedLogs.slice(0, pageSize);

  const rows = paginatedLogs.map((log) => ({
    id: log.id,
    timestamp: log.timestamp.toISOString(),
    provider: "litellm",
    model: log.model,
    app: (log.metadata?.app as string) || "Unknown",
    tokensIn: log.tokensIn,
    tokensOut: log.tokensOut,
    // Display user cost in USD from charge_receipts (LEFT JOIN by litellmCallId)
    cost: chargeMap.get(log.id) ?? "—",
    speed: (log.metadata?.speed as number) || 0,
    finish: (log.metadata?.finishReason as string) || "unknown",
  }));

  // Generate nextCursor if there are more rows
  let nextCursor: string | null = null;
  if (sortedLogs.length > pageSize) {
    const lastRow = paginatedLogs.at(-1);
    if (lastRow) {
      const json = JSON.stringify({
        createdAt: lastRow.timestamp.toISOString(),
        id: lastRow.id,
      });
      nextCursor = Buffer.from(json).toString("base64");
    }
  }

  const result: ActivityOutput = {
    effectiveStep,
    chartSeries,
    totals,
    rows,
    nextCursor,
  };

  // Log completion event with observability metrics
  const logEvent: AiActivityQueryCompletedEvent = {
    event: EVENT_NAMES.AI_ACTIVITY_QUERY_COMPLETED,
    reqId: effectiveReqId,
    routeId: "ai.activity.v1",
    scope: "user",
    billingAccountId: billingAccount.id,
    effectiveStep,
    durationMs: performance.now() - startTime,
    resultCount: rows.length,
    fetchedLogCount,
    unjoinedLogCount,
    status: "success",
  };
  logger.info(logEvent, EVENT_NAMES.AI_ACTIVITY_QUERY_COMPLETED);

  return result;
}
