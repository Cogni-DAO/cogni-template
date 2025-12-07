// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/_facades/ai/activity.server`
 * Purpose: App-layer facade for Activity dashboard.
 * Scope: Resolves session user to billing account, delegates to Activity feature. Does not handle HTTP transport.
 * Invariants: Only app layer imports this; validates billing account.
 * Side-effects: IO
 * Links: [ActivityService](../../../features/ai/services/activity.ts)
 * @public
 */

import { randomUUID } from "node:crypto";
import type { z } from "zod";

import { resolveActivityDeps } from "@/bootstrap/container";
import type { aiActivityOperation } from "@/contracts/ai.activity.v1.contract";
import { ActivityService } from "@/features/ai/services/activity";
import { getOrCreateBillingAccountForUser } from "@/lib/auth/mapping";
import type { SessionUser } from "@/shared/auth";
import {
  type AiActivityQueryCompletedEvent,
  EVENT_NAMES,
  makeLogger,
} from "@/shared/observability";

const logger = makeLogger({ component: "ActivityFacade" });

type ActivityInput = z.infer<typeof aiActivityOperation.input> & {
  sessionUser: SessionUser;
  /** Optional correlation ID - generated if not provided */
  reqId?: string;
};

type ActivityOutput = z.infer<typeof aiActivityOperation.output>;

export async function getActivity(
  input: ActivityInput
): Promise<ActivityOutput> {
  const startTime = performance.now();
  const effectiveReqId = input.reqId ?? randomUUID();
  const { usageService, accountService } = resolveActivityDeps();
  const activityService = new ActivityService(usageService);

  const billingAccount = await getOrCreateBillingAccountForUser(
    accountService,
    {
      userId: input.sessionUser.id,
      ...(input.sessionUser.walletAddress
        ? { walletAddress: input.sessionUser.walletAddress }
        : {}),
    }
  );

  const [stats, logs] = await Promise.all([
    activityService.getActivitySummary({
      billingAccountId: billingAccount.id,
      from: new Date(input.from),
      to: new Date(input.to),
      groupBy: input.groupBy,
    }),
    activityService.getRecentActivity({
      billingAccountId: billingAccount.id,
      limit: input.limit,
      ...(input.cursor ? { cursor: input.cursor } : {}),
    }),
  ]);

  // Map to contract DTOs
  const chartSeries = stats.series.map((bucket) => ({
    bucketStart: bucket.bucketStart.toISOString(),
    spend: bucket.spend,
    tokens: bucket.tokens,
    requests: bucket.requests,
  }));

  const totals = {
    spend: {
      total: stats.totals.spend,
      avgDay: "0", // TBD: Implement avg calculation
      pastRange: "0", // TBD: Implement past range
    },
    tokens: {
      total: stats.totals.tokens,
      avgDay: 0,
      pastRange: 0,
    },
    requests: {
      total: stats.totals.requests,
      avgDay: 0,
      pastRange: 0,
    },
  };

  // Simple avgDay calculation (total / days in range)
  const diffMs = new Date(input.to).getTime() - new Date(input.from).getTime();
  const diffDays = Math.max(1, diffMs / (1000 * 60 * 60 * 24));

  totals.spend.avgDay = (
    Number.parseFloat(stats.totals.spend) / diffDays
  ).toFixed(6);
  totals.tokens.avgDay = Math.round(stats.totals.tokens / diffDays);
  totals.requests.avgDay = Math.round(stats.totals.requests / diffDays);

  const rows = logs.logs.map((log) => ({
    id: log.id,
    timestamp: log.timestamp.toISOString(),
    provider: "litellm", // Hardcoded for now, could come from metadata
    model: log.model,
    app: (log.metadata?.app as string) || "Unknown",
    tokensIn: log.tokensIn,
    tokensOut: log.tokensOut,
    cost: log.cost,
    speed: (log.metadata?.speed as number) || 0,
    finish: (log.metadata?.finishReason as string) || "unknown",
  }));

  let nextCursor: string | null = null;
  if (logs.nextCursor) {
    const json = JSON.stringify({
      createdAt: logs.nextCursor.createdAt.toISOString(),
      id: logs.nextCursor.id,
    });
    nextCursor = Buffer.from(json).toString("base64");
  }

  const result: ActivityOutput = {
    chartSeries,
    totals,
    rows,
    nextCursor,
    telemetrySource: stats.telemetrySource,
  };

  // Log completion event
  const logEvent: AiActivityQueryCompletedEvent = {
    event: EVENT_NAMES.AI_ACTIVITY_QUERY_COMPLETED,
    reqId: effectiveReqId,
    routeId: "ai.activity.v1",
    scope: "user",
    billingAccountId: billingAccount.id,
    telemetrySource: stats.telemetrySource,
    groupBy: input.groupBy,
    durationMs: performance.now() - startTime,
    resultCount: rows.length,
    status: "success",
  };
  logger.info(logEvent, EVENT_NAMES.AI_ACTIVITY_QUERY_COMPLETED);

  return result;
}
