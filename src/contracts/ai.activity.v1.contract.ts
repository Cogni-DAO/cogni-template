// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@contracts/ai.activity.v1.contract`
 * Purpose: Contract for fetching AI usage activity (charts + logs).
 * Scope: Defines input/output for activity dashboard. Does not implement logic.
 * Invariants:
 * - Time is UTC ISO strings.
 * - Range is [from, to) (inclusive start, exclusive end).
 * - Chart buckets are zero-filled for the requested range.
 * - Money is decimal string to avoid float precision issues.
 * - Cursor is opaque string.
 * - P1: spend = our billing (charged_credits), telemetry = LiteLLM (model/tokens).
 * Side-effects: none
 * Links: [ActivityService](../../features/ai/services/activity.ts), docs/ACTIVITY_METRICS.md
 * @public
 */

import { z } from "zod";

export const aiActivityOperation = {
  id: "ai.activity.v1",
  summary: "Fetch AI activity statistics and logs",
  description:
    "Returns usage statistics (spend, tokens, requests) grouped by time, and a paginated list of usage logs.",
  input: z.object({
    from: z.string().datetime().describe("Start time (inclusive, UTC ISO)"),
    to: z.string().datetime().describe("End time (exclusive, UTC ISO)"),
    groupBy: z.enum(["day", "hour"]).describe("Time bucket granularity"),
    cursor: z.string().optional().describe("Opaque cursor for pagination"),
    limit: z
      .number()
      .int()
      .positive()
      .max(100)
      .default(20)
      .describe("Max logs to return"),
  }),
  output: z.object({
    chartSeries: z.array(
      z.object({
        bucketStart: z.string().datetime(),
        spend: z.string().describe("Decimal string USD"),
        tokens: z.number().int().nonnegative(),
        requests: z.number().int().nonnegative(),
      })
    ),
    totals: z.object({
      spend: z.object({
        total: z.string().describe("Decimal string USD"),
        avgDay: z.string().describe("Total / calendar days"),
        pastRange: z.string().describe("Total for previous equivalent range"),
      }),
      tokens: z.object({
        total: z.number().int(),
        avgDay: z.number(),
        pastRange: z.number().int(),
      }),
      requests: z.object({
        total: z.number().int(),
        avgDay: z.number(),
        pastRange: z.number().int(),
      }),
    }),
    rows: z.array(
      z.object({
        id: z.string(),
        timestamp: z.string().datetime(),
        provider: z.string(),
        model: z.string(),
        app: z.string().optional(),
        tokensIn: z.number().int(),
        tokensOut: z.number().int(),
        cost: z.string().describe("Decimal string USD"),
        speed: z.number().describe("Tokens per second"),
        finish: z.string().optional(),
      })
    ),
    nextCursor: z.string().nullable(),
  }),
} as const;
