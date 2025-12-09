// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/ai/services/activity`
 * Purpose: Feature service for fetching activity data.
 * Scope: Orchestrates UsageService. Validates inputs. Does not access DB directly.
 * Invariants:
 * - Enforces max time range (90 days).
 * - Enforces maxPoints (~240 buckets) via step selection.
 * - Throws InvalidRangeError for invalid ranges (from >= to).
 * - Scopes data to billingAccountId.
 * - Validates cursor format using Zod.
 * Side-effects: none
 * Links: [UsageService](../../../ports/usage.port.ts)
 * @public
 */

import { z } from "zod";

import {
  type ActivityStep,
  MAX_RANGE_FOR_STEP,
  MAX_RANGE_MS,
  STEP_MS,
} from "@/contracts/ai.activity.v1.contract";
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

/**
 * Ordered steps from finest to coarsest granularity.
 * Max is 1d (no weekly buckets - too coarse for useful analysis).
 */
const STEPS_ORDERED: ActivityStep[] = ["5m", "15m", "1h", "6h", "1d"];

/**
 * Derive the optimal step for a given range.
 * Picks the finest granularity that keeps bucket count <= 240.
 */
export function deriveStep(rangeMs: number): ActivityStep {
  for (const step of STEPS_ORDERED) {
    const bucketCount = Math.ceil(rangeMs / STEP_MS[step]);
    if (bucketCount <= 240) {
      return step;
    }
  }
  // Fallback to coarsest (1d)
  return "1d";
}

/**
 * Validate activity date range and step constraints.
 * Throws InvalidRangeError on validation failure.
 *
 * @returns { effectiveStep, diffDays } - Server-derived step and days for avgDay calculations
 */
export function validateActivityRange(params: {
  from: Date;
  to: Date;
  step?: ActivityStep | undefined;
}): { effectiveStep: ActivityStep; diffDays: number } {
  const { from, to, step } = params;

  if (from.getTime() >= to.getTime()) {
    throw new InvalidRangeError("Invalid time range: from must be before to");
  }

  const diffMs = to.getTime() - from.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  // Enforce overall max range (90 days)
  if (diffMs > MAX_RANGE_MS) {
    throw new InvalidRangeError("Date range too large (max 90 days)");
  }

  // Derive step if not provided
  const effectiveStep = step ?? deriveStep(diffMs);

  // Validate step is appropriate for range (maxPoints check)
  if (diffMs > MAX_RANGE_FOR_STEP[effectiveStep]) {
    const maxDays = Math.floor(
      MAX_RANGE_FOR_STEP[effectiveStep] / (1000 * 60 * 60 * 24)
    );
    throw new InvalidRangeError(
      `Date range too large for ${effectiveStep} step (max ~${maxDays} days for ~240 buckets)`
    );
  }

  return { effectiveStep, diffDays };
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
    step?: ActivityStep | undefined;
  }): Promise<UsageStatsResult & { effectiveStep: ActivityStep }> {
    const { billingAccountId, from, to, step } = params;

    // Validate range and derive step
    const { effectiveStep } = validateActivityRange({ from, to, step });

    // Map step to groupBy for UsageService (legacy interface)
    // TODO: Update UsageService to accept step directly
    const groupBy = effectiveStep === "1d" ? "day" : "hour";

    const stats = await this.usageService.getUsageStats({
      billingAccountId,
      from,
      to,
      groupBy,
    });

    return { ...stats, effectiveStep };
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
