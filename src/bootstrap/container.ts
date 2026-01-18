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
  DrizzleAiTelemetryAdapter,
  DrizzleExecutionGrantAdapter,
  DrizzleJobQueueAdapter,
  DrizzlePaymentAttemptRepository,
  DrizzleScheduleManagerAdapter,
  DrizzleScheduleRunAdapter,
  EvmRpcOnChainVerifierAdapter,
  getDb,
  LangfuseAdapter,
  LiteLlmActivityUsageAdapter,
  LiteLlmAdapter,
  LiteLlmUsageServiceAdapter,
  type MimirAdapterConfig,
  MimirMetricsAdapter,
  SystemClock,
  ViemEvmOnchainClient,
  ViemTreasuryAdapter,
} from "@/adapters/server";
import {
  FakeLlmAdapter,
  FakeMetricsAdapter,
  getTestEvmOnchainClient,
  getTestOnChainVerifier,
} from "@/adapters/test";
import type { RateLimitBypassConfig } from "@/bootstrap/http/wrapPublicRoute";
import type {
  AccountService,
  AiTelemetryPort,
  Clock,
  ExecutionGrantPort,
  JobQueuePort,
  LangfusePort,
  LlmService,
  MetricsQueryPort,
  OnChainVerifier,
  PaymentAttemptRepository,
  ScheduleManagerPort,
  ScheduleRunRepository,
  TreasuryReadPort,
  UsageLogEntry,
  UsageLogsByRangeParams,
  UsageService,
} from "@/ports";
import { serverEnv } from "@/shared/env";
import { makeLogger } from "@/shared/observability";
import type { EvmOnchainClient } from "@/shared/web3/onchain/evm-onchain-client.interface";

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
  evmOnchainClient: EvmOnchainClient;
  metricsQuery: MetricsQueryPort;
  treasuryReadPort: TreasuryReadPort;
  /** AI telemetry DB writer - always wired */
  aiTelemetry: AiTelemetryPort;
  /** Langfuse tracer - undefined when LANGFUSE_SECRET_KEY not set */
  langfuse: LangfusePort | undefined;
  // Scheduling ports
  jobQueue: JobQueuePort;
  executionGrantPort: ExecutionGrantPort;
  scheduleRunRepository: ScheduleRunRepository;
  scheduleManager: ScheduleManagerPort;
}

// Feature-specific dependency types
// AI adapter deps: used internally by createInProcGraphExecutor
export type AiAdapterDeps = Pick<
  Container,
  "llmService" | "accountService" | "clock" | "aiTelemetry" | "langfuse"
>;

/**
 * Activity dashboard dependencies.
 * Note: usageService requires listUsageLogsByRange (only on LiteLlmUsageServiceAdapter, not general UsageService).
 */
export type ActivityDeps = {
  usageService: UsageService & {
    listUsageLogsByRange(
      params: UsageLogsByRangeParams
    ): Promise<{ logs: UsageLogEntry[] }>;
  };
  accountService: AccountService;
};

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

  // EvmOnchainClient: test uses singleton fake (configurable from tests), production uses viem RPC
  const evmOnchainClient = env.isTestMode
    ? getTestEvmOnchainClient()
    : new ViemEvmOnchainClient();

  // OnChainVerifier: test uses singleton fake (configurable from tests), production uses EVM RPC verifier
  const onChainVerifier = env.isTestMode
    ? getTestOnChainVerifier()
    : new EvmRpcOnChainVerifierAdapter(evmOnchainClient);

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
  const paymentAttemptRepository = new DrizzlePaymentAttemptRepository(db);

  // UsageService: P1 - LiteLLM is canonical usage log source for Activity (no fallback)
  const usageService = new LiteLlmUsageServiceAdapter(
    new LiteLlmActivityUsageAdapter()
  );

  // TreasuryReadPort: always uses ViemTreasuryAdapter (no test fake needed - mocked at port level in tests)
  const treasuryReadPort = new ViemTreasuryAdapter(evmOnchainClient);

  // AI Telemetry: DrizzleAiTelemetryAdapter always wired (per AI_SETUP_SPEC.md)
  const aiTelemetry = new DrizzleAiTelemetryAdapter(db);

  // Langfuse: only wired when LANGFUSE_SECRET_KEY is set (optional)
  // Environment read by SDK from LANGFUSE_TRACING_ENVIRONMENT env var
  const langfuse: Container["langfuse"] =
    env.LANGFUSE_SECRET_KEY && env.LANGFUSE_PUBLIC_KEY
      ? new LangfuseAdapter({
          publicKey: env.LANGFUSE_PUBLIC_KEY,
          secretKey: env.LANGFUSE_SECRET_KEY,
          ...(env.LANGFUSE_BASE_URL ? { baseUrl: env.LANGFUSE_BASE_URL } : {}),
        })
      : undefined;

  const clock = new SystemClock();

  // Scheduling adapters
  const jobQueue = new DrizzleJobQueueAdapter(db);
  const executionGrantPort = new DrizzleExecutionGrantAdapter(db);
  const scheduleRunRepository = new DrizzleScheduleRunAdapter(db);
  const scheduleManager = new DrizzleScheduleManagerAdapter(
    db,
    jobQueue,
    executionGrantPort
  );

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
    clock,
    paymentAttemptRepository,
    onChainVerifier,
    evmOnchainClient,
    metricsQuery,
    treasuryReadPort,
    aiTelemetry,
    langfuse,
    jobQueue,
    executionGrantPort,
    scheduleRunRepository,
    scheduleManager,
  };
}

/**
 * Resolves dependencies for AI adapter construction.
 * Used by graph-executor.factory.ts.
 */
export function resolveAiAdapterDeps(): AiAdapterDeps {
  const container = getContainer();
  return {
    llmService: container.llmService,
    accountService: container.accountService,
    clock: container.clock,
    aiTelemetry: container.aiTelemetry,
    langfuse: container.langfuse,
  };
}

export function resolveActivityDeps(): ActivityDeps {
  const container = getContainer();
  return {
    usageService: container.usageService as ActivityDeps["usageService"],
    accountService: container.accountService,
  };
}

/**
 * Scheduling dependencies for worker task execution.
 * Used by scheduler-worker package.
 */
export type SchedulingDeps = Pick<
  Container,
  | "jobQueue"
  | "executionGrantPort"
  | "scheduleRunRepository"
  | "scheduleManager"
  | "accountService"
>;

export function resolveSchedulingDeps(): SchedulingDeps {
  const container = getContainer();
  return {
    jobQueue: container.jobQueue,
    executionGrantPort: container.executionGrantPort,
    scheduleRunRepository: container.scheduleRunRepository,
    scheduleManager: container.scheduleManager,
    accountService: container.accountService,
  };
}
