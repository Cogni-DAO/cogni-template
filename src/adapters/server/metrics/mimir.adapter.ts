// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/metrics/mimir.adapter`
 * Purpose: Grafana Cloud Mimir adapter for Prometheus metrics queries.
 * Scope: Implements MetricsQueryPort; HTTP client for Prometheus query API; handles auth, timeout, error mapping. Does not implement query building, k-anonymity logic, or caching.
 * Invariants: Uses basic auth; respects timeout via AbortSignal; converts HTTP errors to exceptions.
 * Side-effects: IO (HTTP requests to Mimir)
 * Notes: Queries use Prometheus HTTP API v1 format (query, query_range).
 * Links: Used by analytics service via container; requires MIMIR_URL, MIMIR_USER, MIMIR_TOKEN.
 * @internal
 */

import type {
  InstantQueryParams,
  MetricsQueryPort,
  PrometheusInstantResult,
  PrometheusRangeResult,
  RangeQueryParams,
} from "@/ports";

export interface MimirAdapterConfig {
  url: string; // Grafana Cloud Mimir endpoint
  username: string; // Basic auth username
  password: string; // Basic auth password/token
  timeoutMs: number; // Query timeout in milliseconds
}

/**
 * Mimir adapter for Prometheus metrics queries.
 * Implements Prometheus HTTP API v1 query and query_range endpoints.
 */
export class MimirMetricsAdapter implements MetricsQueryPort {
  constructor(private readonly config: MimirAdapterConfig) {}

  /**
   * Execute a range query (query_range).
   * Maps Date objects to Unix timestamps for Prometheus API.
   */
  async queryRange(params: RangeQueryParams): Promise<PrometheusRangeResult> {
    const url = new URL("/api/v1/query_range", this.config.url);
    url.searchParams.set("query", params.query);
    url.searchParams.set(
      "start",
      Math.floor(params.start.getTime() / 1000).toString()
    );
    url.searchParams.set(
      "end",
      Math.floor(params.end.getTime() / 1000).toString()
    );
    url.searchParams.set("step", params.step);

    const result = await this.fetch<PrometheusRangeResult>(url);
    return result;
  }

  /**
   * Execute an instant query (query).
   * Evaluates PromQL at a single point in time.
   */
  async queryInstant(
    params: InstantQueryParams
  ): Promise<PrometheusInstantResult> {
    const url = new URL("/api/v1/query", this.config.url);
    url.searchParams.set("query", params.query);
    if (params.time) {
      url.searchParams.set(
        "time",
        Math.floor(params.time.getTime() / 1000).toString()
      );
    }

    const result = await this.fetch<PrometheusInstantResult>(url);
    return result;
  }

  /**
   * Internal fetch with auth, timeout, and error handling.
   */
  private async fetch<T>(url: URL): Promise<T> {
    const authHeader = `Basic ${Buffer.from(
      `${this.config.username}:${this.config.password}`
    ).toString("base64")}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs
    );

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: authHeader,
          Accept: "application/json",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `Mimir query failed: ${response.status} ${response.statusText}`
        );
      }

      const json = await response.json();

      // Prometheus API wraps results in { status: "success", data: ... }
      if (json.status !== "success") {
        throw new Error(`Mimir query error: ${json.error || "Unknown error"}`);
      }

      return json.data as T;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Mimir query timeout after ${this.config.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
