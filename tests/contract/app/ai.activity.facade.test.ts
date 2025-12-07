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
    },
    accountService: {
      getOrCreateBillingAccountForUser: vi.fn().mockResolvedValue({
        id: "billing-1",
      }),
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
      groupBy: "day" as const,
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

    expect(result.chartSeries).toHaveLength(1);
    expect(result.totals.spend.total).toBe("10.50");
    expect(result.rows).toHaveLength(1);
    expect(result.nextCursor).toBeDefined();
    expect(result.telemetrySource).toBe("fallback"); // P0: local receipts mode
  });
});
