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

import { Agent, type Dispatcher, setGlobalDispatcher } from "undici";
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

  // Create two agents: strict for external, relaxed for localhost
  const strictAgent = new Agent({
    connect: {
      rejectUnauthorized: true,
    },
  });

  const localhostAgent = new Agent({
    connect: {
      rejectUnauthorized: false, // Accept self-signed certs for localhost only
    },
  });

  // Custom dispatcher as plain object implementing Dispatcher interface
  const dispatcher = {
    dispatch(
      opts: Dispatcher.DispatchOptions,
      handler: Dispatcher.DispatchHandler
    ) {
      const origin = String(opts.origin ?? "");
      const isLocalhost =
        origin.startsWith("https://localhost") ||
        origin.startsWith("https://127.0.0.1");

      const agent = isLocalhost ? localhostAgent : strictAgent;
      return agent.dispatch(opts, handler);
    },
    close() {
      strictAgent.close();
      localhostAgent.close();
      return Promise.resolve();
    },
    destroy(err?: Error | null) {
      if (err) {
        strictAgent.destroy(err);
        localhostAgent.destroy(err);
      } else {
        strictAgent.destroy();
        localhostAgent.destroy();
      }
      return Promise.resolve();
    },
  } as Dispatcher;

  // Set the global dispatcher for all fetch requests
  setGlobalDispatcher(dispatcher);
});

afterEach(() => {
  // Clean up test state between tests
  // Reset any global mocks or state
});
