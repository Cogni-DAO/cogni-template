// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/test`
 * Purpose: Barrel exports for test adapter implementations.
 * Scope: Re-exports all test adapters for clean imports. Does not contain logic.
 * Invariants: All test adapters exported; maintains same interface as real adapters.
 * Side-effects: none
 * Notes: Used by bootstrap container for environment-based adapter wiring.
 * Links: Used by src/bootstrap/container.ts
 * @public
 */

export { FakeLlmAdapter } from "./ai/fake-llm.adapter";
export { FakeMetricsAdapter } from "./metrics/fake-metrics.adapter";
export {
  FakeEvmOnchainClient,
  getTestEvmOnchainClient,
  resetTestEvmOnchainClient,
} from "./onchain/fake-evm-onchain-client.adapter";
export {
  FakeOnChainVerifierAdapter,
  getTestOnChainVerifier,
  resetTestOnChainVerifier,
} from "./payments/fake-onchain-verifier.adapter";
