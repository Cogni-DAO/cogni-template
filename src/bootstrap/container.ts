// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@bootstrap/container`
 * Purpose: Dependency injection container for application composition root with environment-based adapter selection.
 * Scope: Wire adapters to ports for runtime dependency injection; single source of truth for real vs fake adapter wiring. Does not handle singleton management or lifecycle.
 * Invariants: All ports wired; stateless containers; only adapter instantiation point.
 * Side-effects: none
 * Notes: Uses serverEnv.isTestMode (APP_ENV=test) to wire fake adapters (FakeAccountService, FakeLlmAdapter) in CI, real adapters otherwise.
 * Links: Used by API routes and other entry points
 * @public
 */

import {
  db,
  DrizzleAccountService,
  LiteLlmAdapter,
  SystemClock,
} from "@/adapters/server";
import { FakeAccountService, FakeLlmAdapter } from "@/adapters/test";
import type { AccountService, Clock, LlmService } from "@/ports";
import { serverEnv } from "@/shared/env";

export interface Container {
  llmService: LlmService;
  accountService: AccountService;
  clock: Clock;
}

export function createContainer(): Container {
  // Environment-based adapter wiring - single source of truth
  const llmService = serverEnv.isTestMode
    ? new FakeLlmAdapter()
    : new LiteLlmAdapter();

  const accountService = serverEnv.isTestMode
    ? new FakeAccountService()
    : new DrizzleAccountService(db);

  return {
    llmService,
    accountService,
    clock: new SystemClock(),
  };
}

// Alias for AI-specific dependency resolution
export const resolveAiDeps = createContainer;
