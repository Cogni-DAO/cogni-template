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

export type { EvmOnchainClient } from "@/shared/web3/onchain/evm-onchain-client.interface";
export { DrizzleAccountService } from "./accounts/drizzle.adapter";
export { DrizzleUsageAdapter } from "./accounts/drizzle.usage.adapter";
// Graph execution infrastructure
export { AggregatingGraphExecutor } from "./ai/aggregating-executor";
export type {
  GraphCapabilities,
  GraphDescriptor,
  GraphProvider,
} from "./ai/graph-provider";
export {
  type CompletionStreamFn,
  type CompletionStreamParams,
  type CompletionStreamResult,
  type CompletionUnitParams,
  type CompletionUnitResult,
  InProcGraphExecutorAdapter,
  type InProcGraphExecutorDeps,
} from "./ai/inproc-graph.adapter";
// LangGraph provider
export {
  type AnyBoundTool,
  type CompletionUnitAdapter,
  LANGGRAPH_PROVIDER_ID,
  type LangGraphCatalog,
  type LangGraphCatalogEntry,
  LangGraphInProcProvider,
} from "./ai/langgraph";
export { LiteLlmActivityUsageAdapter } from "./ai/litellm.activity-usage.adapter";
export { LiteLlmAdapter } from "./ai/litellm.adapter";
export { LiteLlmUsageServiceAdapter } from "./ai/litellm.usage-service.adapter";
export { DrizzleAiTelemetryAdapter } from "./ai-telemetry/drizzle.adapter";
export {
  LangfuseAdapter,
  type LangfuseAdapterConfig,
} from "./ai-telemetry/langfuse.adapter";
export { type Database, getDb } from "./db/client";
export {
  type MimirAdapterConfig,
  MimirMetricsAdapter,
} from "./metrics/mimir.adapter";
export { ViemEvmOnchainClient } from "./onchain/viem-evm-onchain-client.adapter";
export { ViemTreasuryAdapter } from "./onchain/viem-treasury.adapter";
export { DrizzlePaymentAttemptRepository } from "./payments/drizzle-payment-attempt.adapter";
export { EvmRpcOnChainVerifierAdapter } from "./payments/evm-rpc-onchain-verifier.adapter";
export { PonderOnChainVerifierAdapter } from "./payments/ponder-onchain-verifier.adapter";
export { SystemClock } from "./time/system.adapter";
