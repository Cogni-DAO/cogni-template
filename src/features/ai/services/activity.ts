// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/ai/services/activity`
 * Purpose: Feature service for fetching activity data.
 * Scope: Orchestrates UsageService. Validates inputs. Does not access DB directly.
 * Invariants:
 * - Enforces max time range (90 days daily, 7 days hourly).
 * - Throws InvalidRangeError for invalid ranges (from >= to).
 * - Scopes data to billingAccountId.
 * - Validates cursor format using Zod.
 * Side-effects: none
 * Links: [UsageService](../../../ports/usage.port.ts)
 * @public
 */

import { z } from "zod";

import type { UsageLogsResult, UsageService, UsageStatsResult } from "@/ports";

export class InvalidCursorError extends Error {
  constructor(message = "Invalid cursor format") {
    super(message);
    this.name = "InvalidCursorError";
  }
}

export class InvalidRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRangeError";
  }
}

const CursorSchema = z.object({
  createdAt: z.string().datetime(),
  id: z.string(),
});

export class ActivityService {
  constructor(private readonly usageService: UsageService) {}

  async getActivitySummary(params: {
    billingAccountId: string;
    from: Date;
    to: Date;
    groupBy: "day" | "hour";
  }): Promise<UsageStatsResult> {
    const { billingAccountId, from, to, groupBy } = params;

    // Validate range
    if (from.getTime() >= to.getTime()) {
      throw new InvalidRangeError("Invalid time range: from must be before to");
    }

    const diffMs = to.getTime() - from.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (groupBy === "day" && diffDays > 90) {
      throw new InvalidRangeError(
        "Date range too large for daily grouping (max 90 days)"
      );
    }
    if (groupBy === "hour" && diffDays > 7) {
      throw new InvalidRangeError(
        "Date range too large for hourly grouping (max 7 days)"
      );
    }

    return this.usageService.getUsageStats({
      billingAccountId,
      from,
      to,
      groupBy,
    });
  }

  async getRecentActivity(params: {
    billingAccountId: string;
    limit: number;
    cursor?: string; // Opaque string from API/Contract
  }): Promise<UsageLogsResult> {
    const { billingAccountId, limit, cursor } = params;

    let decodedCursor: { createdAt: Date; id: string } | undefined;

    if (cursor) {
      try {
        const json = Buffer.from(cursor, "base64").toString("utf-8");
        const parsed = JSON.parse(json);
        const result = CursorSchema.safeParse(parsed);

        if (!result.success) {
          throw new InvalidCursorError();
        }

        decodedCursor = {
          createdAt: new Date(result.data.createdAt),
          id: result.data.id,
        };
      } catch (error) {
        if (error instanceof InvalidCursorError) {
          throw error;
        }
        throw new InvalidCursorError();
      }
    }

    return this.usageService.listUsageLogs({
      billingAccountId,
      limit,
      ...(decodedCursor ? { cursor: decodedCursor } : {}),
    });
  }
}
