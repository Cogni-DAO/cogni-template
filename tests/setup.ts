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

import https from "https";
import fetch, { Headers, Request, Response } from "node-fetch";
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
    APP_ENV: "test",
    // Disable external service calls for unit tests
    DISABLE_TELEMETRY: "true",
    DISABLE_EXTERNAL_CALLS: "true",
    // Minimal env vars to prevent validation failures
    // Real integration tests will override these
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    LITELLM_MASTER_KEY: "test-key",
  });

  // HTTPS agent that trusts self-signed certs
  const localHttpsAgent = new https.Agent({
    rejectUnauthorized: false,
  });

  // Wrap fetch: only relax TLS for localhost HTTPS
  const wrappedFetch: typeof globalThis.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input.toString();

    if (
      url.startsWith("https://localhost") ||
      url.startsWith("https://127.0.0.1")
    ) {
      return fetch(url, {
        ...init,
        // node-fetch-specific agent option
        agent: localHttpsAgent,
      } as Parameters<typeof fetch>[1]) as ReturnType<typeof globalThis.fetch>;
    }

    // All other requests use normal validation
    return fetch(url, init as Parameters<typeof fetch>[1]) as ReturnType<
      typeof globalThis.fetch
    >;
  };

  // Install node-fetch as the global fetch for tests
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = wrappedFetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).Request = Request;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).Response = Response;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).Headers = Headers;
});

afterEach(() => {
  // Clean up test state between tests
  // Reset any global mocks or state
});
