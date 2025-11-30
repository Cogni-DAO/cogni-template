// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@bootstrap/container`
 * Purpose: Dependency injection container for application composition root with environment-based adapter selection.
 * Scope: Wire adapters to ports for runtime dependency injection; single source of truth for real vs fake adapter wiring. Does not handle singleton management or lifecycle.
 * Invariants: All ports wired; stateless containers; only adapter instantiation point.
 * Side-effects: none
 * Notes: Uses serverEnv.isTestMode (APP_ENV=test) to wire FakeLlmAdapter in CI, DrizzleAccountService always used for accounts.
 * Links: Used by API routes and other entry points
 * @public
 */

import {
  DrizzleAccountService,
  DrizzlePaymentAttemptRepository,
  getDb,
  LiteLlmAdapter,
  PonderOnChainVerifierAdapter,
  SystemClock,
} from "@/adapters/server";
import { FakeLlmAdapter, FakeOnChainVerifierAdapter } from "@/adapters/test";
import type {
  AccountService,
  Clock,
  LlmService,
  OnChainVerifier,
  PaymentAttemptRepository,
} from "@/ports";
import { serverEnv } from "@/shared/env";

export interface Container {
  llmService: LlmService;
  accountService: AccountService;
  clock: Clock;
  paymentAttemptRepository: PaymentAttemptRepository;
  onChainVerifier: OnChainVerifier;
}

// Feature-specific dependency types
export type AiCompletionDeps = Pick<
  Container,
  "llmService" | "accountService" | "clock"
>;

export function createContainer(): Container {
  const env = serverEnv();
  const db = getDb();

  // Environment-based adapter wiring - single source of truth
  const llmService = env.isTestMode
    ? new FakeLlmAdapter()
    : new LiteLlmAdapter();

  // OnChainVerifier: test uses fake, production uses Ponder stub (real Ponder in Phase 3)
  const onChainVerifier = env.isTestMode
    ? new FakeOnChainVerifierAdapter()
    : new PonderOnChainVerifierAdapter();

  // Always use real database adapters
  // Testing strategy: unit tests mock the port, integration tests use real DB
  const accountService = new DrizzleAccountService(db);
  const paymentAttemptRepository = new DrizzlePaymentAttemptRepository(db);

  return {
    llmService,
    accountService,
    clock: new SystemClock(),
    paymentAttemptRepository,
    onChainVerifier,
  };
}

/**
 * Resolves dependencies for AI completion feature
 * Returns subset of Container needed for AI operations
 */
export function resolveAiDeps(): AiCompletionDeps {
  const container = createContainer();
  return {
    llmService: container.llmService,
    accountService: container.accountService,
    clock: container.clock,
  };
}
