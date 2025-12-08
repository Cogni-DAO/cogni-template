// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/ai/litellm.activity-usage`
 * Purpose: Unit tests for LiteLlmActivityUsageAdapter with mocked HTTP calls.
 * Scope: Tests P1 invariants: bounded pagination, server-derived identity, error handling, pass-through data. Does not make real HTTP calls.
 * Invariants: No real HTTP calls; deterministic responses; ActivityUsagePort contract compliance
 * Side-effects: none (mocked fetch)
 * Links: src/adapters/server/ai/litellm.activity-usage.adapter.ts, docs/ACTIVITY_METRICS.md (P1 invariants)
 * @public
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { LiteLlmActivityUsageAdapter } from "@/adapters/server/ai/litellm.activity-usage.adapter";
import { ActivityUsageUnavailableError } from "@/ports/usage.port";

// Mock serverEnv
vi.mock("@/shared/env/server", () => ({
  serverEnv: () => ({
    LITELLM_BASE_URL: "https://api.test-litellm.com",
    LITELLM_MASTER_KEY: "test-master-key",
  }),
}));

describe("LiteLlmActivityUsageAdapter", () => {
  let adapter: LiteLlmActivityUsageAdapter;
  const mockFetch = vi.fn();

  beforeEach(() => {
    adapter = new LiteLlmActivityUsageAdapter();
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

    it("always sends billingAccountId as end_user parameter (server-derived identity)", async () => {
      // LiteLLM stores the `user` param from completions as `end_user` in spend logs
      // LiteLLM /spend/logs returns raw array, not {logs: [...]}
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      await adapter.getSpendLogs(billingAccountId, params);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("end_user=acc-123"),
        expect.any(Object)
      );
    });

    it("fetches logs in single request (LiteLLM has no cursor pagination)", async () => {
      // LiteLLM /spend/logs returns raw array with no pagination cursor
      // Pagination is controlled by date range and limit params
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            request_id: "req-1",
            startTime: "2025-01-01T00:00:00Z",
            model: "gpt-4",
            prompt_tokens: 100,
            completion_tokens: 50,
            spend: "0.002",
          },
          {
            request_id: "req-2",
            startTime: "2025-01-01T01:00:00Z",
            model: "gpt-4",
            prompt_tokens: 200,
            completion_tokens: 100,
            spend: "0.004",
          },
        ],
      });

      const result = await adapter.getSpendLogs(billingAccountId, params);

      // Single fetch - no pagination loop
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.logs.length).toBe(2);
      // No pagination - single fetch
    });

    it("enforces limit≤100 (caps at 100 even if higher requested)", async () => {
      // LiteLLM returns raw array, not {logs: [...]}
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
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
      // LiteLLM returns raw array, not {logs: [...]}
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            request_id: "req-1",
            startTime: "2025-01-15T12:00:00Z",
            model: "gpt-4-turbo",
            prompt_tokens: 150,
            completion_tokens: 75,
            spend: "0.005", // Provider cost from LiteLLM
          },
        ],
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

    it("throws ActivityUsageUnavailableError when response shape is invalid (wrapped object)", async () => {
      // Old format {logs: [...]} should fail validation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          logs: [
            {
              request_id: "req-1",
              startTime: "2025-01-15T12:00:00Z",
              model: "gpt-4",
              prompt_tokens: 100,
              completion_tokens: 50,
              spend: "0.002",
            },
          ],
        }),
      });

      await expect(
        adapter.getSpendLogs(billingAccountId, params)
      ).rejects.toThrow(ActivityUsageUnavailableError);
    });

    it("throws ActivityUsageUnavailableError when log entry missing required request_id", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            // Missing request_id
            startTime: "2025-01-15T12:00:00Z",
            model: "gpt-4",
            prompt_tokens: 100,
            completion_tokens: 50,
            spend: "0.002",
          },
        ],
      });

      await expect(
        adapter.getSpendLogs(billingAccountId, params)
      ).rejects.toThrow(ActivityUsageUnavailableError);
    });

    it("throws ActivityUsageUnavailableError only for infra errors (502/503/504)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
      });

      await expect(
        adapter.getSpendLogs(billingAccountId, params)
      ).rejects.toThrow(ActivityUsageUnavailableError);
    });

    it("throws regular Error (not ActivityUsageUnavailableError) for 4xx/500 errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      await expect(
        adapter.getSpendLogs(billingAccountId, params)
      ).rejects.toThrow(
        "LiteLLM /spend/logs failed: 500 Internal Server Error"
      );
    });

    it("throws ActivityUsageUnavailableError on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network timeout"));

      await expect(
        adapter.getSpendLogs(billingAccountId, params)
      ).rejects.toThrow(ActivityUsageUnavailableError);
    });
  });

  describe("getSpendChart", () => {
    const billingAccountId = "acc-456";
    const params = {
      from: new Date("2025-01-01T00:00:00Z"),
      to: new Date("2025-01-31T23:59:59Z"),
      groupBy: "day" as const,
    };

    it("always sends billingAccountId as end_user parameter", async () => {
      // LiteLLM stores the `user` param from completions as `end_user` in spend logs
      // LiteLLM returns raw array, not {buckets: [...]}
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      await adapter.getSpendChart(billingAccountId, params);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("end_user=acc-456"),
        expect.any(Object)
      );
    });

    it("maps aggregated buckets without recomputing cost", async () => {
      // LiteLLM returns raw array, not {buckets: [...]}
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
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

    it("throws ActivityUsageUnavailableError when response shape is invalid (wrapped object)", async () => {
      // Old format {buckets: [...]} should fail validation
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
          ],
        }),
      });

      await expect(
        adapter.getSpendChart(billingAccountId, params)
      ).rejects.toThrow(ActivityUsageUnavailableError);
    });

    it("throws regular Error (not ActivityUsageUnavailableError) for 4xx errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      });

      await expect(
        adapter.getSpendChart(billingAccountId, params)
      ).rejects.toThrow("LiteLLM /spend/logs failed: 401 Unauthorized");
    });

    it("throws ActivityUsageUnavailableError only for infra errors (502/503/504)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
      });

      await expect(
        adapter.getSpendChart(billingAccountId, params)
      ).rejects.toThrow(ActivityUsageUnavailableError);
    });
  });
});
