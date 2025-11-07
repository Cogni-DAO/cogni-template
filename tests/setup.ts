/**
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: 2024 Cogni-DAO
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
