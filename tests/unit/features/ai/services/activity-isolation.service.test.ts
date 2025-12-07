// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/unit/features/ai/services/activity-isolation.service`
 * Purpose: ActivityService isolation tests with synthetic UsageTelemetryPort.
 * Scope: Verifies account isolation at service layer with controlled telemetry. Does not test HTTP or DB.
 * Invariants: User A sees only A's data, User B sees only B's data, no cross-contamination.
 * Side-effects: none (mocked dependencies)
 * Links: src/features/ai/services/activity.ts, docs/ACTIVITY_METRICS.md
 * @public
 */

import { describe, expect, it, vi } from "vitest";

import { ActivityService } from "@/features/ai/services/activity";
import type { UsageService } from "@/ports";

describe("ActivityService Isolation (P1)", () => {
  describe("Account scoping with synthetic telemetry", () => {
    it("User A aggregates only include User A logs", async () => {
      // Mock UsageService with mixed User A/B data
      const usageService: UsageService = {
        getUsageStats: vi.fn().mockResolvedValue({
          series: [
            {
              bucketStart: new Date("2024-06-15T00:00:00Z"),
              spend: "0.007", // User A data
              tokens: 150,
              requests: 2,
            },
          ],
          totals: {
            spend: "0.007",
            tokens: 150,
            requests: 2,
          },
        }),
        listUsageLogs: vi.fn().mockResolvedValue({
          logs: [
            {
              id: "req-a-1",
              timestamp: new Date("2024-06-15T10:00:00Z"),
              model: "gpt-4",
              tokensIn: 75,
              tokensOut: 75,
              cost: "0.005",
            },
            {
              id: "req-a-2",
              timestamp: new Date("2024-06-15T11:00:00Z"),
              model: "gpt-4",
              tokensIn: 25,
              tokensOut: 25,
              cost: "0.002",
            },
          ],
        }),
      };

      const service = new ActivityService(usageService);

      const result = await service.getActivitySummary({
        billingAccountId: "user-a-billing",
        from: new Date("2024-06-15T00:00:00Z"),
        to: new Date("2024-06-16T00:00:00Z"),
        groupBy: "day",
      });

      // Verify UsageService was called with User A's billingAccountId
      expect(usageService.getUsageStats).toHaveBeenCalledWith(
        expect.objectContaining({
          billingAccountId: "user-a-billing",
        })
      );

      // Verify aggregates match User A data
      expect(result.series).toHaveLength(1);
      expect(result.totals.spend).toBe("0.007");
      expect(result.totals.requests).toBe(2);
    });

    it("User B aggregates only include User B logs", async () => {
      // Mock UsageService with User B data
      const usageService: UsageService = {
        getUsageStats: vi.fn().mockResolvedValue({
          series: [
            {
              bucketStart: new Date("2024-06-15T00:00:00Z"),
              spend: "0.16", // User B data
              tokens: 500,
              requests: 3,
            },
          ],
          totals: {
            spend: "0.16",
            tokens: 500,
            requests: 3,
          },
        }),
        listUsageLogs: vi.fn().mockResolvedValue({
          logs: [
            {
              id: "req-b-1",
              timestamp: new Date("2024-06-15T10:00:00Z"),
              model: "gpt-4",
              tokensIn: 200,
              tokensOut: 100,
              cost: "0.1",
            },
            {
              id: "req-b-2",
              timestamp: new Date("2024-06-15T11:00:00Z"),
              model: "gpt-4",
              tokensIn: 150,
              tokensOut: 50,
              cost: "0.05",
            },
            {
              id: "req-b-3",
              timestamp: new Date("2024-06-15T12:00:00Z"),
              model: "gpt-3.5-turbo",
              tokensIn: 40,
              tokensOut: 10,
              cost: "0.01",
            },
          ],
        }),
      };

      const service = new ActivityService(usageService);

      const result = await service.getActivitySummary({
        billingAccountId: "user-b-billing",
        from: new Date("2024-06-15T00:00:00Z"),
        to: new Date("2024-06-16T00:00:00Z"),
        groupBy: "day",
      });

      // Verify UsageService was called with User B's billingAccountId
      expect(usageService.getUsageStats).toHaveBeenCalledWith(
        expect.objectContaining({
          billingAccountId: "user-b-billing",
        })
      );

      // Verify aggregates match User B data (different from User A)
      expect(result.series).toHaveLength(1);
      expect(result.totals.spend).toBe("0.16");
      expect(result.totals.requests).toBe(3);
    });

    it("SECURITY: billingAccountId parameter controls scoping, not implicit state", async () => {
      const usageService: UsageService = {
        getUsageStats: vi.fn().mockResolvedValue({
          series: [],
          totals: { spend: "0", tokens: 0, requests: 0 },
        }),
        listUsageLogs: vi.fn().mockResolvedValue({ logs: [] }),
      };

      const service = new ActivityService(usageService);

      // Call with explicit billingAccountId
      await service.getRecentActivity({
        billingAccountId: "explicit-account-123",
        limit: 10,
      });

      // Verify the explicit billingAccountId was used
      expect(usageService.listUsageLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          billingAccountId: "explicit-account-123",
        })
      );
    });
  });
});
