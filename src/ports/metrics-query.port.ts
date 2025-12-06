// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@ports/metrics-query.port`
 * Purpose: Port interface for querying Prometheus-compatible time-series databases (Mimir, Prometheus).
 * Scope: Defines contract for metrics queries; does not implement HTTP transport or query building.
 * Invariants: All timestamps are Date objects; errors bubble as adapter-specific exceptions.
 * Side-effects: none (interface only)
 * Notes: Supports both instant and range queries per Prometheus HTTP API spec.
 * Links: Implemented by MimirMetricsAdapter; consumed by analytics service.
 * @public
 */

/**
 * Single data point in a Prometheus time series.
 * Timestamp is Unix seconds (Prometheus format), value is numeric or null.
 */
export interface PrometheusDataPoint {
  timestamp: number; // Unix timestamp in seconds
  value: number | null; // Metric value or null (no data)
}

/**
 * Time series result with metric labels and data points.
 */
export interface PrometheusTimeSeries {
  metric: Record<string, string>; // Label key-value pairs
  values: PrometheusDataPoint[]; // Array of [timestamp, value] points
}

/**
 * Result from query_range endpoint.
 * Contains multiple time series matching the query.
 */
export interface PrometheusRangeResult {
  resultType: "matrix";
  result: PrometheusTimeSeries[];
}

/**
 * Single instant value with metric labels.
 */
export interface PrometheusInstantValue {
  metric: Record<string, string>;
  value: [number, string]; // [timestamp, value as string]
}

/**
 * Result from query endpoint (instant query).
 * Contains vector of instant values.
 */
export interface PrometheusInstantResult {
  resultType: "vector";
  result: PrometheusInstantValue[];
}

/**
 * Parameters for range query.
 */
export interface RangeQueryParams {
  /** PromQL expression */
  query: string;
  /** Start timestamp */
  start: Date;
  /** End timestamp */
  end: Date;
  /** Query resolution step (e.g., "1h", "5m") */
  step: string;
}

/**
 * Parameters for instant query.
 */
export interface InstantQueryParams {
  /** PromQL expression */
  query: string;
  /** Evaluation timestamp (optional, defaults to now) */
  time?: Date;
}

/**
 * Port for querying Prometheus-compatible metrics backends.
 * Supports both range and instant queries per Prometheus HTTP API.
 */
export interface MetricsQueryPort {
  /**
   * Execute a range query (query_range).
   * Returns time series data over a specified time range with given resolution.
   */
  queryRange(params: RangeQueryParams): Promise<PrometheusRangeResult>;

  /**
   * Execute an instant query (query).
   * Returns metric values at a single point in time.
   */
  queryInstant(params: InstantQueryParams): Promise<PrometheusInstantResult>;
}
