// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/contract/app/ai.activity.invariants.test`
 * Purpose: Contract tests for Activity feature security invariants.
 * Scope: Tests cursor validation, range validation, and error response codes. Does not test UI or API layer.
 * Invariants:
 * - inv_cursor_is_opaque_and_safe: Invalid cursor returns error (not silent reset)
 * - inv_time_semantics_enforced: Out-of-range groupBy returns error
 * - inv_bounded_queries: Limit is enforced
 * Side-effects: none
 * Notes: These are invariant-locking tests - if these fail, the feature is broken.
 * Links: [ActivityService](../../../../src/features/ai/services/activity.ts)
 * @public
 */

import { describe, expect, it, vi } from "vitest";

import {
  ActivityService,
  InvalidCursorError,
  InvalidRangeError,
} from "@/features/ai/services/activity";
import type { UsageService } from "@/ports";

// Mock UsageService that returns empty results
function createMockUsageService(): UsageService {
  return {
    getUsageStats: vi.fn().mockResolvedValue({
      series: [],
      totals: { spend: "0", tokens: 0, requests: 0 },
    }),
    listUsageLogs: vi.fn().mockResolvedValue({
      logs: [],
    }),
  };
}

describe("Activity Feature Invariants", () => {
  describe("inv_cursor_is_opaque_and_safe", () => {
    it("Invalid base64 cursor throws InvalidCursorError", async () => {
      const usageService = createMockUsageService();
      const service = new ActivityService(usageService);

      await expect(
        service.getRecentActivity({
          billingAccountId: "test-account",
          limit: 10,
          cursor: "not-valid-base64!!!",
        })
      ).rejects.toThrow(InvalidCursorError);
    });

    it("Valid base64 but invalid JSON cursor throws InvalidCursorError", async () => {
      const usageService = createMockUsageService();
      const service = new ActivityService(usageService);

      // Valid base64, but not valid JSON
      const invalidJson = Buffer.from("not json").toString("base64");

      await expect(
        service.getRecentActivity({
          billingAccountId: "test-account",
          limit: 10,
          cursor: invalidJson,
        })
      ).rejects.toThrow(InvalidCursorError);
    });

    it("Valid JSON but missing required fields throws InvalidCursorError", async () => {
      const usageService = createMockUsageService();
      const service = new ActivityService(usageService);

      // Valid JSON but missing createdAt or id
      const missingFields = Buffer.from(
        JSON.stringify({ foo: "bar" })
      ).toString("base64");

      await expect(
        service.getRecentActivity({
          billingAccountId: "test-account",
          limit: 10,
          cursor: missingFields,
        })
      ).rejects.toThrow(InvalidCursorError);
    });

    it("Valid cursor with only createdAt (missing id) throws InvalidCursorError", async () => {
      const usageService = createMockUsageService();
      const service = new ActivityService(usageService);

      const missingId = Buffer.from(
        JSON.stringify({ createdAt: "2024-01-01T00:00:00Z" })
      ).toString("base64");

      await expect(
        service.getRecentActivity({
          billingAccountId: "test-account",
          limit: 10,
          cursor: missingId,
        })
      ).rejects.toThrow(InvalidCursorError);
    });

    it("Valid cursor with only id (missing createdAt) throws InvalidCursorError", async () => {
      const usageService = createMockUsageService();
      const service = new ActivityService(usageService);

      const missingCreatedAt = Buffer.from(
        JSON.stringify({ id: "some-uuid" })
      ).toString("base64");

      await expect(
        service.getRecentActivity({
          billingAccountId: "test-account",
          limit: 10,
          cursor: missingCreatedAt,
        })
      ).rejects.toThrow(InvalidCursorError);
    });

    it("Invalid datetime format in cursor throws InvalidCursorError", async () => {
      const usageService = createMockUsageService();
      const service = new ActivityService(usageService);

      // Has both fields but createdAt is not valid ISO datetime
      const invalidDatetime = Buffer.from(
        JSON.stringify({ createdAt: "not-a-datetime", id: "some-uuid" })
      ).toString("base64");

      await expect(
        service.getRecentActivity({
          billingAccountId: "test-account",
          limit: 10,
          cursor: invalidDatetime,
        })
      ).rejects.toThrow(InvalidCursorError);
    });

    it("Valid cursor structure passes validation", async () => {
      const usageService = createMockUsageService();
      const service = new ActivityService(usageService);

      const validCursor = Buffer.from(
        JSON.stringify({
          createdAt: "2024-01-01T00:00:00Z",
          id: "valid-uuid-here",
        })
      ).toString("base64");

      // Should not throw - will call the mock service
      const result = await service.getRecentActivity({
        billingAccountId: "test-account",
        limit: 10,
        cursor: validCursor,
      });

      expect(result).toBeDefined();
      expect(usageService.listUsageLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          billingAccountId: "test-account",
          limit: 10,
          cursor: expect.objectContaining({
            id: "valid-uuid-here",
          }),
        })
      );
    });

    it("No cursor is valid (first page)", async () => {
      const usageService = createMockUsageService();
      const service = new ActivityService(usageService);

      const result = await service.getRecentActivity({
        billingAccountId: "test-account",
        limit: 10,
      });

      expect(result).toBeDefined();
      expect(usageService.listUsageLogs).toHaveBeenCalledWith({
        billingAccountId: "test-account",
        limit: 10,
      });
    });
  });

  describe("inv_time_semantics_enforced (range limits)", () => {
    it("Daily grouping with > 90 days throws error", async () => {
      const usageService = createMockUsageService();
      const service = new ActivityService(usageService);

      const from = new Date("2024-01-01T00:00:00Z");
      const to = new Date("2024-05-01T00:00:00Z"); // ~120 days

      await expect(
        service.getActivitySummary({
          billingAccountId: "test-account",
          from,
          to,
          groupBy: "day",
        })
      ).rejects.toThrow(InvalidRangeError);
    });

    it("Daily grouping with exactly 90 days passes", async () => {
      const usageService = createMockUsageService();
      const service = new ActivityService(usageService);

      // 90 days exactly should pass
      const from90 = new Date("2024-01-01T00:00:00Z");
      const to90 = new Date("2024-03-31T00:00:00Z"); // 90 days

      const result = await service.getActivitySummary({
        billingAccountId: "test-account",
        from: from90,
        to: to90,
        groupBy: "day",
      });

      expect(result).toBeDefined();
    });

    it("Hourly grouping with > 7 days throws error", async () => {
      const usageService = createMockUsageService();
      const service = new ActivityService(usageService);

      const from = new Date("2024-01-01T00:00:00Z");
      const to = new Date("2024-01-10T00:00:00Z"); // 9 days

      await expect(
        service.getActivitySummary({
          billingAccountId: "test-account",
          from,
          to,
          groupBy: "hour",
        })
      ).rejects.toThrow(InvalidRangeError);
    });

    it("Hourly grouping with exactly 7 days passes", async () => {
      const usageService = createMockUsageService();
      const service = new ActivityService(usageService);

      const from = new Date("2024-01-01T00:00:00Z");
      const to = new Date("2024-01-08T00:00:00Z"); // exactly 7 days

      const result = await service.getActivitySummary({
        billingAccountId: "test-account",
        from,
        to,
        groupBy: "hour",
      });

      expect(result).toBeDefined();
    });

    it("Hourly grouping with 6 days passes", async () => {
      const usageService = createMockUsageService();
      const service = new ActivityService(usageService);

      const from = new Date("2024-01-01T00:00:00Z");
      const to = new Date("2024-01-07T00:00:00Z"); // 6 days

      const result = await service.getActivitySummary({
        billingAccountId: "test-account",
        from,
        to,
        groupBy: "hour",
      });

      expect(result).toBeDefined();
    });

    it("Negative range (from > to) throws InvalidRangeError", async () => {
      const usageService = createMockUsageService();
      const service = new ActivityService(usageService);

      const from = new Date("2024-01-10T00:00:00Z");
      const to = new Date("2024-01-01T00:00:00Z"); // backwards

      await expect(
        service.getActivitySummary({
          billingAccountId: "test-account",
          from,
          to,
          groupBy: "day",
        })
      ).rejects.toThrow(InvalidRangeError);
    });
  });

  describe("inv_bounded_queries (limit enforcement)", () => {
    it("Limit is passed through to adapter", async () => {
      const usageService = createMockUsageService();
      const service = new ActivityService(usageService);

      await service.getRecentActivity({
        billingAccountId: "test-account",
        limit: 50,
      });

      expect(usageService.listUsageLogs).toHaveBeenCalledWith({
        billingAccountId: "test-account",
        limit: 50,
      });
    });

    it("Service accepts any limit (contract enforces max)", async () => {
      const usageService = createMockUsageService();
      const service = new ActivityService(usageService);

      // Service doesn't enforce max, contract does
      await service.getRecentActivity({
        billingAccountId: "test-account",
        limit: 1000,
      });

      expect(usageService.listUsageLogs).toHaveBeenCalledWith({
        billingAccountId: "test-account",
        limit: 1000,
      });
    });
  });
});
