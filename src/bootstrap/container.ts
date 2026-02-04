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

import type { ToolSourcePort } from "@cogni/ai-core";
import type {
  MetricsCapability,
  RepoCapability,
  WebSearchCapability,
} from "@cogni/ai-tools";
import type { UserId } from "@cogni/ids";
import type { ScheduleControlPort } from "@cogni/scheduler-core";
import type { Logger } from "pino";
import {
  DrizzleAiTelemetryAdapter,
  DrizzleExecutionGrantUserAdapter,
  DrizzleExecutionGrantWorkerAdapter,
  DrizzleExecutionRequestAdapter,
  DrizzlePaymentAttemptRepository,
  DrizzleScheduleRunAdapter,
  DrizzleScheduleUserAdapter,
  EvmRpcOnChainVerifierAdapter,
  getDb,
  LangfuseAdapter,
  LiteLlmActivityUsageAdapter,
  LiteLlmAdapter,
  LiteLlmUsageServiceAdapter,
  type MimirAdapterConfig,
  MimirMetricsAdapter,
  SystemClock,
  TemporalScheduleControlAdapter,
  UserDrizzleAccountService,
  ViemEvmOnchainClient,
  ViemTreasuryAdapter,
} from "@/adapters/server";
import { ServiceDrizzleAccountService } from "@/adapters/server/accounts/drizzle.adapter";
import { getServiceDb } from "@/adapters/server/db/drizzle.service-client";
import {
  FakeLlmAdapter,
  FakeMetricsAdapter,
  getTestEvmOnchainClient,
  getTestOnChainVerifier,
} from "@/adapters/test";
import { createToolBindings } from "@/bootstrap/ai/tool-bindings";
import { createBoundToolSource } from "@/bootstrap/ai/tool-source.factory";
import {
  createMetricsCapability,
  derivePrometheusQueryUrl,
} from "@/bootstrap/capabilities/metrics";
import { createRepoCapability } from "@/bootstrap/capabilities/repo";
import { createWebSearchCapability } from "@/bootstrap/capabilities/web-search";
import type { RateLimitBypassConfig } from "@/bootstrap/http/wrapPublicRoute";
import type {
  AccountService,
  AiTelemetryPort,
  Clock,
  ExecutionGrantUserPort,
  ExecutionGrantWorkerPort,
  ExecutionRequestPort,
  LangfusePort,
  LlmService,
  MetricsQueryPort,
  OnChainVerifier,
  PaymentAttemptRepository,
  ScheduleRunRepository,
  ScheduleUserPort,
  ServiceAccountService,
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
  accountsForUser(userId: UserId): AccountService;
  serviceAccountService: ServiceAccountService;
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
  // Scheduling ports (split by trust boundary)
  scheduleControl: ScheduleControlPort;
  executionGrantPort: ExecutionGrantUserPort;
  executionGrantWorkerPort: ExecutionGrantWorkerPort;
  executionRequestPort: ExecutionRequestPort;
  scheduleRunRepository: ScheduleRunRepository;
  scheduleManager: ScheduleUserPort;
  /** Metrics capability for AI tools - requires PROMETHEUS_URL to be configured */
  metricsCapability: MetricsCapability;
  /** Web search capability for AI tools - requires TAVILY_API_KEY to be configured */
  webSearchCapability: WebSearchCapability;
  /** Repo capability for AI tools - requires COGNI_REPO_PATH */
  repoCapability: RepoCapability;
  /** Tool source with real implementations for AI tool execution */
  toolSource: ToolSourcePort;
}

// Feature-specific dependency types
// AI adapter deps: used internally by createGraphExecutor
export type AiAdapterDeps = {
  llmService: LlmService;
  accountService: AccountService;
  clock: Clock;
  aiTelemetry: AiTelemetryPort;
  langfuse: LangfusePort | undefined;
};

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

  // MetricsQuery: test uses fake adapter, production uses Prometheus HTTP API
  // Not configured: stub that throws on use (deferred error, doesn't block startup)
  const metricsQuery: MetricsQueryPort = env.isTestMode
    ? new FakeMetricsAdapter()
    : (() => {
        const queryUrl = derivePrometheusQueryUrl(env);
        if (
          !queryUrl ||
          !env.PROMETHEUS_READ_USERNAME ||
          !env.PROMETHEUS_READ_PASSWORD
        ) {
          // Return stub that throws on use - allows app to start without metrics config
          const notConfiguredError = new Error(
            "MetricsQueryPort not configured. Set PROMETHEUS_QUERY_URL (or PROMETHEUS_REMOTE_WRITE_URL " +
              "ending in /api/prom/push) + PROMETHEUS_READ_USERNAME + PROMETHEUS_READ_PASSWORD."
          );
          return {
            queryRange: async () => {
              throw notConfiguredError;
            },
            queryInstant: async () => {
              throw notConfiguredError;
            },
            queryTemplate: async () => {
              throw notConfiguredError;
            },
          } satisfies MetricsQueryPort;
        }

        const mimirConfig: MimirAdapterConfig = {
          url: queryUrl,
          username: env.PROMETHEUS_READ_USERNAME,
          password: env.PROMETHEUS_READ_PASSWORD,
          timeoutMs: env.ANALYTICS_QUERY_TIMEOUT_MS,
        };
        return new MimirMetricsAdapter(mimirConfig);
      })();

  // Always use real database adapters
  // Testing strategy: unit tests mock the port, integration tests use real DB
  const serviceAccountService = new ServiceDrizzleAccountService(
    getServiceDb()
  );
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

  // Scheduling adapters (from @cogni/db-client)
  // Per architecture rule: composition root injects loggers via child()

  // ScheduleControlPort: Temporal is required infrastructure
  // Per SCHEDULER_SPEC.md: TEMPORAL_ADDRESS + TEMPORAL_NAMESPACE must be configured
  if (!env.TEMPORAL_ADDRESS || !env.TEMPORAL_NAMESPACE) {
    throw new Error(
      "TEMPORAL_ADDRESS and TEMPORAL_NAMESPACE are required. " +
        "Start Temporal with: pnpm dev:infra"
    );
  }
  const scheduleControl: ScheduleControlPort =
    new TemporalScheduleControlAdapter({
      address: env.TEMPORAL_ADDRESS,
      namespace: env.TEMPORAL_NAMESPACE,
      taskQueue: env.TEMPORAL_TASK_QUEUE,
    });

  // Service DB (BYPASSRLS) for worker adapters
  const serviceDb = getServiceDb();

  // User-facing scheduling (appDb, RLS enforced)
  const executionGrantPort = new DrizzleExecutionGrantUserAdapter(
    db,
    log.child({ component: "DrizzleExecutionGrantUserAdapter" })
  );
  const scheduleManager = new DrizzleScheduleUserAdapter(
    db,
    scheduleControl,
    executionGrantPort,
    log.child({ component: "DrizzleScheduleUserAdapter" })
  );

  // Worker scheduling (serviceDb, BYPASSRLS)
  const executionGrantWorkerPort = new DrizzleExecutionGrantWorkerAdapter(
    serviceDb,
    log.child({ component: "DrizzleExecutionGrantWorkerAdapter" })
  );
  const scheduleRunRepository = new DrizzleScheduleRunAdapter(
    serviceDb,
    log.child({ component: "DrizzleScheduleRunAdapter" })
  );

  // Execution request port (not user-scoped — exempt from RLS)
  const executionRequestPort = new DrizzleExecutionRequestAdapter(
    db,
    log.child({ component: "DrizzleExecutionRequestAdapter" })
  );

  // MetricsCapability for AI tools (requires PROMETHEUS_URL)
  const metricsCapability = createMetricsCapability(env);

  // WebSearchCapability for AI tools (requires TAVILY_API_KEY)
  const webSearchCapability = createWebSearchCapability(env);

  // RepoCapability for AI tools (requires COGNI_REPO_PATH)
  const repoCapability = createRepoCapability(env);

  // ToolSource with real implementations (per CAPABILITY_INJECTION)
  const toolBindings = createToolBindings({
    metricsCapability,
    webSearchCapability,
    repoCapability,
  });
  const toolSource = createBoundToolSource(toolBindings);

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
    accountsForUser: (userId: UserId) =>
      new UserDrizzleAccountService(db, userId),
    serviceAccountService,
    usageService,
    clock,
    paymentAttemptRepository,
    onChainVerifier,
    evmOnchainClient,
    metricsQuery,
    treasuryReadPort,
    aiTelemetry,
    langfuse,
    scheduleControl,
    executionGrantPort,
    executionGrantWorkerPort,
    executionRequestPort,
    scheduleRunRepository,
    scheduleManager,
    metricsCapability,
    webSearchCapability,
    repoCapability,
    toolSource,
  };
}

/**
 * Resolves dependencies for AI adapter construction.
 * Used by graph-executor.factory.ts.
 */
export function resolveAiAdapterDeps(userId: UserId): AiAdapterDeps {
  const container = getContainer();
  return {
    llmService: container.llmService,
    accountService: container.accountsForUser(userId),
    clock: container.clock,
    aiTelemetry: container.aiTelemetry,
    langfuse: container.langfuse,
  };
}

export function resolveActivityDeps(userId: UserId): ActivityDeps {
  const container = getContainer();
  return {
    usageService: container.usageService as ActivityDeps["usageService"],
    accountService: container.accountsForUser(userId),
  };
}

/**
 * Scheduling dependencies for CRUD operations.
 * Used by schedule routes.
 */
export type SchedulingDeps = Pick<
  Container,
  | "scheduleControl"
  | "executionGrantPort"
  | "executionGrantWorkerPort"
  | "scheduleRunRepository"
  | "scheduleManager"
>;

export function resolveSchedulingDeps(): SchedulingDeps {
  const container = getContainer();
  return {
    scheduleControl: container.scheduleControl,
    executionGrantPort: container.executionGrantPort,
    executionGrantWorkerPort: container.executionGrantWorkerPort,
    scheduleRunRepository: container.scheduleRunRepository,
    scheduleManager: container.scheduleManager,
  };
}
