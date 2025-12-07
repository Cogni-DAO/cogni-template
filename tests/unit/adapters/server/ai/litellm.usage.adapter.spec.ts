// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/ai/litellm.usage`
 * Purpose: Unit tests for LiteLlmUsageAdapter with mocked HTTP calls.
 * Scope: Tests P1 invariants: bounded pagination, server-derived identity, error handling, pass-through telemetry.
 * Invariants: No real HTTP calls; deterministic responses; UsageTelemetryPort contract compliance
 * Side-effects: none (mocked fetch)
 * Links: src/adapters/server/ai/litellm.usage.adapter.ts, docs/ACTIVITY_METRICS.md (P1 invariants)
 * @public
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { LiteLlmUsageAdapter } from "@/adapters/server/ai/litellm.usage.adapter";
import { UsageTelemetryUnavailableError } from "@/ports/usage.port";

// Mock serverEnv
vi.mock("@/shared/env/server", () => ({
  serverEnv: () => ({
    LITELLM_BASE_URL: "https://api.test-litellm.com",
    LITELLM_MASTER_KEY: "test-master-key",
  }),
}));

describe("LiteLlmUsageAdapter", () => {
  let adapter: LiteLlmUsageAdapter;
  const mockFetch = vi.fn();

  beforeEach(() => {
    adapter = new LiteLlmUsageAdapter();
    vi.clearAllMocks();
    global.fetch = mockFetch;
  });

  describe("getSpendLogs", () => {
    const billingAccountId = "acc-123";
    const params = {
      from: new Date("2025-01-01T00:00:00Z"),
      to: new Date("2025-01-31T23:59:59Z"),
      limit: 50,
    };

    it("always sends billingAccountId as user_id parameter (server-derived identity)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ logs: [] }),
      });

      await adapter.getSpendLogs(billingAccountId, params);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("user_id=acc-123"),
        expect.any(Object)
      );
    });

    it("enforces MAX_PAGES=10 and sets paginationCapped flag", async () => {
      // Mock 11 pages worth of responses (should stop at page 10)
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            logs: [
              {
                request_id: "req-1",
                startTime: "2025-01-01T00:00:00Z",
                model: "gpt-4",
                prompt_tokens: 100,
                completion_tokens: 50,
                spend: "0.002",
              },
            ],
            next_cursor: "cursor-next", // Always has next page
          }),
        })
      );

      const result = await adapter.getSpendLogs(billingAccountId, params);

      // Should stop at MAX_PAGES=10
      expect(mockFetch).toHaveBeenCalledTimes(10);
      expect(result.paginationCapped).toBe(true);
      expect(result.logs.length).toBe(10); // 1 log per page × 10 pages
    });

    it("enforces limit≤100 (caps at 100 even if higher requested)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ logs: [] }),
      });

      await adapter.getSpendLogs(billingAccountId, {
        ...params,
        limit: 200, // Request 200, should cap at 100
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("limit=100"), // Capped at MAX_LIMIT
        expect.any(Object)
      );
    });

    it("maps LiteLLM response fields as-is without recomputing cost", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          logs: [
            {
              request_id: "req-1",
              startTime: "2025-01-15T12:00:00Z",
              model: "gpt-4-turbo",
              prompt_tokens: 150,
              completion_tokens: 75,
              spend: "0.005", // Provider cost from LiteLLM
            },
          ],
        }),
      });

      const result = await adapter.getSpendLogs(billingAccountId, params);

      expect(result.logs).toHaveLength(1);
      expect(result.logs[0]).toEqual({
        callId: "req-1",
        timestamp: new Date("2025-01-15T12:00:00Z"),
        model: "gpt-4-turbo",
        tokensIn: 150,
        tokensOut: 75,
        providerCostUsd: "0.005", // Pass-through, no recomputation
      });
    });

    it("throws UsageTelemetryUnavailableError when LiteLLM returns 5xx", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
      });

      await expect(
        adapter.getSpendLogs(billingAccountId, params)
      ).rejects.toThrow(UsageTelemetryUnavailableError);
    });

    it("throws UsageTelemetryUnavailableError on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network timeout"));

      await expect(
        adapter.getSpendLogs(billingAccountId, params)
      ).rejects.toThrow(UsageTelemetryUnavailableError);
    });
  });

  describe("getSpendChart", () => {
    const billingAccountId = "acc-456";
    const params = {
      from: new Date("2025-01-01T00:00:00Z"),
      to: new Date("2025-01-31T23:59:59Z"),
      groupBy: "day" as const,
    };

    it("always sends billingAccountId as user_id parameter", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ buckets: [] }),
      });

      await adapter.getSpendChart(billingAccountId, params);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("user_id=acc-456"),
        expect.any(Object)
      );
    });

    it("maps aggregated buckets without recomputing cost", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          buckets: [
            {
              date: "2025-01-01",
              spend: "0.150",
              prompt_tokens: 1000,
              completion_tokens: 500,
              requests: 10,
            },
            {
              date: "2025-01-02",
              spend: "0.200",
              prompt_tokens: 1500,
              completion_tokens: 750,
              requests: 15,
            },
          ],
        }),
      });

      const result = await adapter.getSpendChart(billingAccountId, params);

      expect(result.buckets).toHaveLength(2);
      expect(result.buckets[0]).toEqual({
        bucketStart: new Date("2025-01-01"),
        providerCostUsd: "0.150", // Pass-through
        tokens: 1500, // Sum of prompt + completion
        requests: 10,
      });
    });

    it("throws UsageTelemetryUnavailableError when LiteLLM returns 4xx", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      });

      await expect(
        adapter.getSpendChart(billingAccountId, params)
      ).rejects.toThrow(UsageTelemetryUnavailableError);
    });
  });
});
