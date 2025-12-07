// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@bootstrap/container`
 * Purpose: Dependency injection container for application composition root with environment-based adapter selection.
 * Scope: Wire adapters to ports for runtime dependency injection. Does not handle request-scoped lifecycle.
 * Invariants: All ports wired; single container instance per process; config.unhandledErrorPolicy set by env.
 * Side-effects: IO (initializes logger and emits startup log on first access)
 * Notes: Uses serverEnv.isTestMode (APP_ENV=test) to wire FakeLlmAdapter; ContainerConfig controls wrapper behavior.
 * Links: Used by API routes and other entry points; configure adapters here for DI.
 * @public
 */

import type { Logger } from "pino";

import {
  DrizzleAccountService,
  DrizzlePaymentAttemptRepository,
  DrizzleUsageAdapter,
  getDb,
  LiteLlmAdapter,
  type MimirAdapterConfig,
  MimirMetricsAdapter,
  PonderOnChainVerifierAdapter,
  SystemClock,
} from "@/adapters/server";
import {
  FakeLlmAdapter,
  FakeMetricsAdapter,
  getTestOnChainVerifier,
} from "@/adapters/test";
import type { RateLimitBypassConfig } from "@/bootstrap/http/wrapPublicRoute";
import type {
  AccountService,
  Clock,
  LlmService,
  MetricsQueryPort,
  OnChainVerifier,
  PaymentAttemptRepository,
  UsageService,
} from "@/ports";
import { serverEnv } from "@/shared/env";
import { makeLogger } from "@/shared/observability";

export type UnhandledErrorPolicy = "rethrow" | "respond_500";

export interface ContainerConfig {
  /** How to handle unhandled errors in route wrappers: rethrow for dev/test, respond_500 for production safety */
  unhandledErrorPolicy: UnhandledErrorPolicy;
  /** Rate limit bypass config for stack tests; only enabled when APP_ENV=test */
  rateLimitBypass: RateLimitBypassConfig;
  /** Deploy environment for metrics/logging (e.g., "local", "preview", "production") */
  DEPLOY_ENVIRONMENT: string;
}

export interface Container {
  log: Logger;
  config: ContainerConfig;
  llmService: LlmService;
  accountService: AccountService;
  usageService: UsageService;
  clock: Clock;
  paymentAttemptRepository: PaymentAttemptRepository;
  onChainVerifier: OnChainVerifier;
  metricsQuery: MetricsQueryPort;
}

// Feature-specific dependency types
export type AiCompletionDeps = Pick<
  Container,
  "llmService" | "accountService" | "clock"
>;

export type ActivityDeps = Pick<Container, "usageService" | "accountService">;

// Module-level singleton
let _container: Container | null = null;

/**
 * Get the singleton container instance.
 * Lazily initializes on first access.
 */
export function getContainer(): Container {
  if (!_container) {
    _container = createContainer();
  }
  return _container;
}

/**
 * Reset the singleton container.
 * For tests only - allows fresh container between test runs.
 */
export function resetContainer(): void {
  _container = null;
}

function createContainer(): Container {
  const env = serverEnv();
  const db = getDb();
  const log = makeLogger({ service: "cogni-template" });

  // Startup log - confirm config in Loki (no URLs/secrets)
  log.info(
    {
      env: env.APP_ENV,
      logLevel: env.PINO_LOG_LEVEL,
      pretty: env.NODE_ENV === "development",
    },
    "container initialized"
  );

  // Environment-based adapter wiring - single source of truth
  const llmService = env.isTestMode
    ? new FakeLlmAdapter()
    : new LiteLlmAdapter();

  // OnChainVerifier: test uses singleton fake (configurable from tests), production uses Ponder stub (real Ponder in Phase 3)
  const onChainVerifier = env.isTestMode
    ? getTestOnChainVerifier()
    : new PonderOnChainVerifierAdapter();

  // MetricsQuery: test uses fake adapter, production uses Mimir
  const metricsQuery: MetricsQueryPort = env.isTestMode
    ? new FakeMetricsAdapter()
    : (() => {
        // Mimir config is optional - only required when analytics feature is enabled
        if (!env.MIMIR_URL || !env.MIMIR_USER || !env.MIMIR_TOKEN) {
          // Return fake adapter if Mimir not configured (graceful degradation)
          log.warn(
            "MIMIR_URL/USER/TOKEN not configured; analytics queries will return empty results"
          );
          return new FakeMetricsAdapter();
        }
        const mimirConfig: MimirAdapterConfig = {
          url: env.MIMIR_URL,
          username: env.MIMIR_USER,
          password: env.MIMIR_TOKEN,
          timeoutMs: env.ANALYTICS_QUERY_TIMEOUT_MS,
        };
        return new MimirMetricsAdapter(mimirConfig);
      })();

  // Always use real database adapters
  // Testing strategy: unit tests mock the port, integration tests use real DB
  const accountService = new DrizzleAccountService(db);
  const usageService = new DrizzleUsageAdapter(db);
  const paymentAttemptRepository = new DrizzlePaymentAttemptRepository(db);

  // Config: rethrow in dev/test for diagnosis, respond_500 in production for safety
  const config: ContainerConfig = {
    unhandledErrorPolicy: env.isProd ? "respond_500" : "rethrow",
    // Rate limit bypass: only enabled in test mode (APP_ENV=test)
    // Security: Production builds will never enable bypass regardless of header
    rateLimitBypass: {
      enabled: env.isTestMode,
      headerName: "x-stack-test",
      headerValue: "1",
    },
    // Deploy environment for metrics/logging
    DEPLOY_ENVIRONMENT: env.DEPLOY_ENVIRONMENT ?? "local",
  };

  return {
    log,
    config,
    llmService,
    accountService,
    usageService,
    clock: new SystemClock(),
    paymentAttemptRepository,
    onChainVerifier,
    metricsQuery,
  };
}

/**
 * Resolves dependencies for AI completion feature
 * Returns subset of Container needed for AI operations
 */
export function resolveAiDeps(): AiCompletionDeps {
  const container = getContainer();
  return {
    llmService: container.llmService,
    accountService: container.accountService,
    clock: container.clock,
  };
}

export function resolveActivityDeps(): ActivityDeps {
  const container = getContainer();
  return {
    usageService: container.usageService,
    accountService: container.accountService,
  };
}
