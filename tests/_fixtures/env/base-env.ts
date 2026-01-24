// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@_fixtures/env/base-env`
 * Purpose: Shared base environment variables for unit and contract tests.
 * Scope: Provides minimal valid env object for tests that trigger serverEnv() validation. Does not load .env files.
 * Invariants: All required env vars present; values are test-safe (no real credentials)
 * Side-effects: none (pure data export)
 * Links: tests/unit/shared/env.*.spec.ts, tests/unit/bootstrap/container.spec.ts
 * @public
 */

/**
 * Core env vars required by serverEnv() validation.
 * Does NOT include APP_ENV - let test suites control adapter wiring.
 * Used by tests/setup.ts for global test environment.
 */
export const CORE_TEST_ENV = {
  NODE_ENV: "test",
  // Database (components form DATABASE_URL if not provided)
  POSTGRES_USER: "postgres",
  POSTGRES_PASSWORD: "postgres",
  POSTGRES_DB: "test_db",
  DB_HOST: "localhost",
  DB_PORT: "5432",
  // Auth
  AUTH_SECRET: "x".repeat(32),
  // LiteLLM
  LITELLM_MASTER_KEY: "test-key",
  // Scheduler
  SCHEDULER_API_TOKEN: "x".repeat(32),
  // Temporal (required infrastructure)
  TEMPORAL_ADDRESS: "localhost:7233",
  TEMPORAL_NAMESPACE: "test-namespace",
} as const;

/**
 * Base valid environment for unit/contract tests.
 * Contains all required env vars with test-safe values.
 * Tests can spread this and override specific vars as needed.
 *
 * @example
 * ```ts
 * Object.assign(process.env, {
 *   ...BASE_VALID_ENV,
 *   APP_ENV: "production", // Override specific var
 * });
 * ```
 */
export const BASE_VALID_ENV = {
  ...CORE_TEST_ENV,
  APP_ENV: "test",
} as const;

/**
 * Production-like environment for testing production adapter wiring.
 * Includes additional vars required in production mode.
 */
export const PRODUCTION_VALID_ENV = {
  ...BASE_VALID_ENV,
  NODE_ENV: "test", // Keep test for logging silence
  APP_ENV: "production",
  DB_HOST: "postgres",
  EVM_RPC_URL: "https://eth-sepolia.example.com/v2/test-key",
} as const;

/**
 * Mock serverEnv() return value for contract tests.
 * Use this when mocking @/shared/env to ensure all required fields are present.
 *
 * IMPORTANT: APP_ENV="test" and isTestMode=true are required to wire fake adapters
 * (FakeLlmAdapter, FakeEvmOnchainClient, etc.) instead of real ones.
 *
 * @example
 * ```ts
 * vi.mock("@/shared/env", () => ({
 *   serverEnv: () => MOCK_SERVER_ENV,
 * }));
 * ```
 */
export const MOCK_SERVER_ENV = {
  ...BASE_VALID_ENV,
  // Computed fields that serverEnv() adds
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/test_db",
  isDev: false,
  isTest: true,
  isProd: false,
  isTestMode: true, // Controls fake adapter wiring in container.ts
} as const;
