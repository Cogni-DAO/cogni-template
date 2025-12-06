// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/test/metrics/fake-metrics.adapter`
 * Purpose: Deterministic test double for MetricsQueryPort.
 * Scope: Implements MetricsQueryPort; returns canned Prometheus responses for unit/integration tests. Does not make HTTP requests or access real metrics data.
 * Invariants: Always returns success with empty result sets; predictable for CI.
 * Side-effects: none
 * Notes: Used when APP_ENV=test; replace with real adapter for stack tests.
 * Links: Selected by bootstrap container; implements MetricsQueryPort interface.
 * @internal
 */

import type {
  InstantQueryParams,
  MetricsQueryPort,
  PrometheusInstantResult,
  PrometheusRangeResult,
  RangeQueryParams,
} from "@/ports";

/**
 * Fake metrics adapter for tests.
 * Returns empty result sets by default; can be extended for specific test scenarios.
 */
export class FakeMetricsAdapter implements MetricsQueryPort {
  /**
   * Returns empty range query result.
   * Override in tests for specific scenarios.
   */
  async queryRange(_params: RangeQueryParams): Promise<PrometheusRangeResult> {
    return {
      resultType: "matrix",
      result: [],
    };
  }

  /**
   * Returns empty instant query result.
   * Override in tests for specific scenarios.
   */
  async queryInstant(
    _params: InstantQueryParams
  ): Promise<PrometheusInstantResult> {
    return {
      resultType: "vector",
      result: [],
    };
  }
}
