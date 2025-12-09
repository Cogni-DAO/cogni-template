// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/contract/app/ai.activity.facade`
 * Purpose: Contract tests for ActivityFacade.
 * Scope: Verifies getActivity against contract schema. Does not test UI.
 * Invariants: Uses real database (test stack).
 * Side-effects: IO
 * Links: [ActivityFacade](../../../src/app/_facades/ai/activity.server.ts)
 * @internal
 */

import { describe, expect, it, vi } from "vitest";

import { getActivity } from "@/app/_facades/ai/activity.server";
import { aiActivityOperation } from "@/contracts/ai.activity.v1.contract";
import type { SessionUser } from "@/shared/auth";

// Mock dependencies
vi.mock("@/bootstrap/container", () => ({
  resolveActivityDeps: () => ({
    usageService: {
      getUsageStats: vi.fn().mockResolvedValue({
        series: [
          {
            bucketStart: new Date("2024-01-01T00:00:00Z"),
            spend: "10.50",
            tokens: 1000,
            requests: 50,
          },
        ],
        totals: {
          spend: "10.50",
          tokens: 1000,
          requests: 50,
        },
        telemetrySource: "fallback", // P0: local receipts mode
      }),
      listUsageLogs: vi.fn().mockResolvedValue({
        logs: [
          {
            id: "log-1",
            timestamp: new Date("2024-01-01T12:00:00Z"),
            model: "gpt-4",
            tokensIn: 10,
            tokensOut: 20,
            cost: "0.05",
            metadata: { app: "test-app", speed: 100, finishReason: "stop" },
          },
        ],
        nextCursor: {
          createdAt: new Date("2024-01-01T12:00:00Z"),
          id: "log-1",
        },
      }),
      listUsageLogsByRange: vi.fn().mockResolvedValue({
        logs: [
          {
            id: "log-1",
            timestamp: new Date("2024-01-01T12:00:00Z"),
            model: "gpt-4",
            tokensIn: 10,
            tokensOut: 20,
            cost: "0.05",
            metadata: { app: "test-app", speed: 100, finishReason: "stop" },
          },
        ],
      }),
    },
    accountService: {
      getOrCreateBillingAccountForUser: vi.fn().mockResolvedValue({
        id: "billing-1",
      }),
      // New: facade now joins LiteLLM logs with local charge receipts
      listChargeReceipts: vi.fn().mockResolvedValue([
        {
          requestId: "req-1",
          litellmCallId: "log-1", // Joins with logs[0].id
          chargedCredits: 500000n,
          responseCostUsd: "0.05", // User cost with markup
          createdAt: new Date("2024-01-01T12:00:00Z"), // Required for bucket aggregation
        },
      ]),
    },
  }),
}));

vi.mock("@/lib/auth/mapping", () => ({
  getOrCreateBillingAccountForUser: vi.fn().mockResolvedValue({
    id: "billing-1",
  }),
}));

describe("Activity Facade", () => {
  it("should return valid contract data", async () => {
    const sessionUser: SessionUser = {
      id: "user-1",
      walletAddress: "0x123",
    };

    const input = {
      from: "2024-01-01T00:00:00Z",
      to: "2024-01-02T00:00:00Z",
      limit: 10,
      sessionUser,
    };

    const result = await getActivity(input);

    // Validate against Zod schema
    const parsed = aiActivityOperation.output.safeParse(result);
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      console.error(parsed.error);
    }

    // Server derives optimal step for 1-day range (24 hours)
    // At 15m step: 24h / 15m = 96 buckets (fits in ~240 max)
    expect(result.effectiveStep).toBe("15m");
    expect(result.chartSeries).toHaveLength(96); // Zero-filled buckets

    // Spend is now computed from charge receipts, not usageService.getUsageStats
    // Mock receipt has responseCostUsd: "0.05" → total = 0.050000
    expect(result.totals.spend.total).toBe("0.050000");
    expect(result.rows).toHaveLength(1);
    expect(result.nextCursor).toBeDefined();
  });
});
