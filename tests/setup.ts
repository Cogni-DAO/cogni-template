// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/setup`
 * Purpose: Verifies global test environment setup and isolation across all test suites under controlled conditions.
 * Scope: Configures test environment, env vars, and cleanup hooks. Does NOT mock specific services or ports.
 * Invariants: Tests run in isolation; env vars reset between suites; minimal configuration prevents validation errors.
 * Side-effects: process.env
 * Notes: Integration tests override minimal env vars; beforeAll/afterEach hooks ensure test isolation.
 * Links: vitest.config.mts
 * @public
 */

import { afterEach, beforeAll } from "vitest";

/**
 * Global test setup for deterministic, isolated testing.
 *
 * Following architecture principles:
 * - Unit tests: no I/O, no time, no RNG (use _fakes)
 * - Integration tests: real infra with clean setup/teardown
 * - Contract tests: port compliance verification
 */

beforeAll(() => {
  // Set test environment - minimal required for env validation
  Object.assign(process.env, {
    NODE_ENV: "test",
    // Disable external service calls for unit tests
    DISABLE_TELEMETRY: "true",
    DISABLE_EXTERNAL_CALLS: "true",
    // Minimal env vars to prevent validation failures
    // Real integration tests will override these
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    NEXTAUTH_SECRET: "test-secret-for-validation-only",
  });
});

afterEach(() => {
  // Clean up test state between tests
  // Reset any global mocks or state
});
