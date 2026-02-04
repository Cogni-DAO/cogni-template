// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server`
 * Purpose: Hex entry file for server adapters - canonical import surface.
 * Scope: Re-exports only public server adapter implementations with named exports. Does not export test doubles or internal utilities.
 * Invariants: Named exports only, no export *, runtime implementations
 * Side-effects: none (at import time - adapters have runtime effects when instantiated)
 * Notes: Enforces architectural boundaries via ESLint entry-point rules
 * Links: Used by bootstrap layer for DI container assembly
 * @public
 */

// Scheduling adapters - re-exported from @cogni/db-client package
// Split by trust boundary: User (appDb, RLS enforced), Worker (serviceDb, BYPASSRLS)
export {
  DrizzleExecutionGrantUserAdapter,
  DrizzleExecutionGrantWorkerAdapter,
  DrizzleExecutionRequestAdapter,
  DrizzleScheduleRunAdapter,
  DrizzleScheduleUserAdapter,
  DrizzleScheduleWorkerAdapter,
  type LoggerLike,
} from "@cogni/db-client";
export type { EvmOnchainClient } from "@/shared/web3/onchain/evm-onchain-client.interface";
export { UserDrizzleAccountService } from "./accounts/drizzle.adapter";
export { DrizzleUsageAdapter } from "./accounts/drizzle.usage.adapter";
export type { AgentCatalogProvider } from "./ai/agent-catalog.provider";
// Agent discovery infrastructure
export { AggregatingAgentCatalog } from "./ai/aggregating-agent-catalog";
// Graph execution infrastructure
export { AggregatingGraphExecutor } from "./ai/aggregating-executor";
export type { GraphProvider } from "./ai/graph-provider";
export {
  type CompletionStreamFn,
  type CompletionStreamParams,
  type CompletionStreamResult,
  type CompletionUnitParams,
  type CompletionUnitResult,
  InProcCompletionUnitAdapter,
  type InProcCompletionUnitDeps,
} from "./ai/inproc-completion-unit.adapter";
// LangGraph providers
export {
  type CompletionUnitAdapter,
  // Dev server providers (langgraph dev, port 2024)
  createLangGraphDevClient,
  // Discovery-only provider (no execution deps)
  LANGGRAPH_INPROC_AGENT_CATALOG_PROVIDER_ID,
  // Execution provider (requires CompletionUnitAdapter)
  LANGGRAPH_PROVIDER_ID,
  type LangGraphCatalog,
  type LangGraphCatalogEntry,
  LangGraphDevAgentCatalogProvider,
  type LangGraphDevClientConfig,
  LangGraphDevProvider,
  type LangGraphDevProviderConfig,
  LangGraphInProcAgentCatalogProvider,
  LangGraphInProcProvider,
} from "./ai/langgraph";
export { LiteLlmActivityUsageAdapter } from "./ai/litellm.activity-usage.adapter";
export { LiteLlmAdapter } from "./ai/litellm.adapter";
export { LiteLlmUsageServiceAdapter } from "./ai/litellm.usage-service.adapter";
export type { ObservabilityDecoratorConfig } from "./ai/observability-executor.decorator";
// Observability decorator for Langfuse traces
export { ObservabilityGraphExecutorDecorator } from "./ai/observability-executor.decorator";
export {
  TavilyWebSearchAdapter,
  type TavilyWebSearchConfig,
} from "./ai/tavily-web-search.adapter";
export { DrizzleAiTelemetryAdapter } from "./ai-telemetry/drizzle.adapter";
export {
  type CreateTraceWithIOParams,
  LangfuseAdapter,
  type LangfuseAdapterConfig,
  type LangfuseSpanHandle,
} from "./ai-telemetry/langfuse.adapter";
export { type Database, getDb } from "./db/client";
export {
  type MimirAdapterConfig,
  MimirMetricsAdapter,
  TemplateQueryError,
  type TemplateQueryErrorCode,
} from "./metrics/mimir.adapter";
export { ViemEvmOnchainClient } from "./onchain/viem-evm-onchain-client.adapter";
export { ViemTreasuryAdapter } from "./onchain/viem-treasury.adapter";
export { DrizzlePaymentAttemptRepository } from "./payments/drizzle-payment-attempt.adapter";
export { EvmRpcOnChainVerifierAdapter } from "./payments/evm-rpc-onchain-verifier.adapter";
export { PonderOnChainVerifierAdapter } from "./payments/ponder-onchain-verifier.adapter";
export {
  GitLsFilesAdapter,
  type GitLsFilesAdapterConfig,
  RepoPathError,
  RipgrepAdapter,
  type RipgrepAdapterConfig,
} from "./repo";
// Temporal adapters - schedule control
export {
  TemporalScheduleControlAdapter,
  type TemporalScheduleControlConfig,
} from "./temporal";
export { SystemClock } from "./time/system.adapter";
