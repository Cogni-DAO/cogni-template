// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/unit/adapters/server/metrics/mimir.adapter`
 * Purpose: Unit tests for Mimir adapter with mocked HTTP calls.
 * Scope: Tests auth headers, timeout handling, error mapping. Does NOT test real Mimir service.
 * Invariants: No real HTTP calls; deterministic responses; validates MetricsQueryPort contract compliance.
 * Side-effects: none (mocked fetch)
 * Notes: Tests Basic auth encoding, timeout abort, HTTP error handling.
 * Links: src/adapters/server/metrics/mimir.adapter.ts, MetricsQueryPort port
 * @public
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  type MimirAdapterConfig,
  MimirMetricsAdapter,
} from "@/adapters/server/metrics/mimir.adapter";

describe("MimirMetricsAdapter", () => {
  let adapter: MimirMetricsAdapter;
  let mockFetch: ReturnType<typeof vi.fn>;

  const testConfig: MimirAdapterConfig = {
    url: "https://mimir.example.com",
    username: "test-user",
    password: "test-password",
    timeoutMs: 1000,
  };

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch as typeof fetch;
    adapter = new MimirMetricsAdapter(testConfig);
    vi.clearAllMocks();
  });

  describe("Basic auth header", () => {
    it("should send correct Basic auth header", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "success",
          data: {
            resultType: "matrix",
            result: [],
          },
        }),
      });

      await adapter.queryRange({
        query: "up",
        start: new Date(),
        end: new Date(),
        step: "1h",
      });

      // Extract Authorization header from fetch call
      const fetchCall = mockFetch.mock.calls[0];
      const headers = fetchCall?.[1]?.headers;
      const authHeader = headers?.Authorization;

      // Verify Basic auth header format
      expect(authHeader).toMatch(/^Basic [A-Za-z0-9+/=]+$/);

      // Verify correct credentials (base64 decoded)
      const base64Credentials = authHeader.replace("Basic ", "");
      const decodedCredentials = Buffer.from(
        base64Credentials,
        "base64"
      ).toString("utf8");
      expect(decodedCredentials).toBe("test-user:test-password");
    });

    it("should include Accept: application/json header", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "success",
          data: {
            resultType: "matrix",
            result: [],
          },
        }),
      });

      await adapter.queryRange({
        query: "up",
        start: new Date(),
        end: new Date(),
        step: "1h",
      });

      const fetchCall = mockFetch.mock.calls[0];
      const headers = fetchCall?.[1]?.headers;
      expect(headers?.Accept).toBe("application/json");
    });
  });

  describe("Timeout handling", () => {
    it("should abort request on timeout", async () => {
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";

      mockFetch.mockImplementationOnce(() => {
        return new Promise((_, reject) => {
          // Simulate timeout abort
          setTimeout(() => reject(abortError), 50);
        });
      });

      const shortTimeoutAdapter = new MimirMetricsAdapter({
        ...testConfig,
        timeoutMs: 100,
      });

      await expect(
        shortTimeoutAdapter.queryRange({
          query: "up",
          start: new Date(),
          end: new Date(),
          step: "1h",
        })
      ).rejects.toThrow("Mimir query timeout after 100ms");
    });

    it("should pass AbortSignal to fetch", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "success",
          data: {
            resultType: "matrix",
            result: [],
          },
        }),
      });

      await adapter.queryRange({
        query: "up",
        start: new Date(),
        end: new Date(),
        step: "1h",
      });

      const fetchCall = mockFetch.mock.calls[0];
      const signal = fetchCall?.[1]?.signal;
      expect(signal).toBeInstanceOf(AbortSignal);
    });
  });

  describe("HTTP error handling", () => {
    it("should throw on non-200 HTTP status", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: async () => ({}),
      });

      await expect(
        adapter.queryRange({
          query: "up",
          start: new Date(),
          end: new Date(),
          step: "1h",
        })
      ).rejects.toThrow("Mimir query failed: 500 Internal Server Error");
    });

    it("should throw on Prometheus error status", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "error",
          error: "invalid query syntax",
          errorType: "bad_data",
        }),
      });

      await expect(
        adapter.queryRange({
          query: "invalid{",
          start: new Date(),
          end: new Date(),
          step: "1h",
        })
      ).rejects.toThrow("Mimir query error: invalid query syntax");
    });

    it("should handle JSON parse failures gracefully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error("JSON parse error");
        },
      });

      await expect(
        adapter.queryRange({
          query: "up",
          start: new Date(),
          end: new Date(),
          step: "1h",
        })
      ).rejects.toThrow("JSON parse error");
    });

    it("should handle network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      await expect(
        adapter.queryRange({
          query: "up",
          start: new Date(),
          end: new Date(),
          step: "1h",
        })
      ).rejects.toThrow("Network error");
    });

    it("should not leak credentials in error messages", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection failed"));

      try {
        await adapter.queryRange({
          query: "up",
          start: new Date(),
          end: new Date(),
          step: "1h",
        });
      } catch (error) {
        const errorMessage = (error as Error).message;
        expect(errorMessage).not.toContain("test-password");
        expect(errorMessage).not.toContain("test-user");
      }
    });
  });

  describe("queryRange", () => {
    it("should construct correct query_range URL with parameters", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "success",
          data: {
            resultType: "matrix",
            result: [],
          },
        }),
      });

      const start = new Date("2025-01-01T00:00:00Z");
      const end = new Date("2025-01-01T01:00:00Z");

      await adapter.queryRange({
        query: "up",
        start,
        end,
        step: "5m",
      });

      const fetchCall = mockFetch.mock.calls[0];
      const url = new URL(fetchCall?.[0]);

      expect(url.pathname).toBe("/api/v1/query_range");
      expect(url.searchParams.get("query")).toBe("up");
      expect(url.searchParams.get("start")).toBe(
        Math.floor(start.getTime() / 1000).toString()
      );
      expect(url.searchParams.get("end")).toBe(
        Math.floor(end.getTime() / 1000).toString()
      );
      expect(url.searchParams.get("step")).toBe("5m");
    });

    it("should return parsed matrix result", async () => {
      const mockData = {
        resultType: "matrix",
        result: [
          {
            metric: { job: "test" },
            values: [
              { timestamp: 1000, value: 1 },
              { timestamp: 2000, value: 2 },
            ],
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "success",
          data: mockData,
        }),
      });

      const result = await adapter.queryRange({
        query: "up",
        start: new Date(),
        end: new Date(),
        step: "1h",
      });

      expect(result).toEqual(mockData);
    });
  });

  describe("queryInstant", () => {
    it("should construct correct query URL with time parameter", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "success",
          data: {
            resultType: "vector",
            result: [],
          },
        }),
      });

      const time = new Date("2025-01-01T12:00:00Z");

      await adapter.queryInstant({
        query: "up",
        time,
      });

      const fetchCall = mockFetch.mock.calls[0];
      const url = new URL(fetchCall?.[0]);

      expect(url.pathname).toBe("/api/v1/query");
      expect(url.searchParams.get("query")).toBe("up");
      expect(url.searchParams.get("time")).toBe(
        Math.floor(time.getTime() / 1000).toString()
      );
    });

    it("should omit time parameter when not provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "success",
          data: {
            resultType: "vector",
            result: [],
          },
        }),
      });

      await adapter.queryInstant({
        query: "up",
      });

      const fetchCall = mockFetch.mock.calls[0];
      const url = new URL(fetchCall?.[0]);

      expect(url.searchParams.get("time")).toBeNull();
    });

    it("should return parsed vector result", async () => {
      const mockData = {
        resultType: "vector",
        result: [
          {
            metric: { job: "test" },
            value: [1609459200, "42"],
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "success",
          data: mockData,
        }),
      });

      const result = await adapter.queryInstant({
        query: "up",
      });

      expect(result).toEqual(mockData);
    });
  });
});
