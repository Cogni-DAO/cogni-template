// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/_fixtures/ai/completion-facade-setup`
 * Purpose: Reusable test fixture for completion facade tests with proper dependency mocking.
 * Scope: Provides consistent mock setup for testing completion.server.ts facade. Does NOT test real dependencies.
 * Invariants: All mocks configured; dependencies properly injected; serverEnv mocked
 * Side-effects: none
 * Notes: Use this to ensure consistent test setup and prevent ad-hoc mocks in test files
 * Links: completion.server.ts, FakeLlmService, FakeClock
 * @public
 */

import { FakeClock } from "@tests/_fakes";
import { createMockAccountServiceWithDefaults } from "@tests/_fakes/accounts/mock-account.service";
import { FakeLlmService } from "@tests/_fakes/ai/fakes";

/**
 * Setup completion facade test environment with mocked dependencies
 * Call this before importing the facade module to ensure mocks are in place
 */
export function setupCompletionFacadeTest() {
  const llmService = new FakeLlmService({ responseContent: "Test response" });
  const accountService = createMockAccountServiceWithDefaults();
  const clock = new FakeClock("2025-01-01T00:00:00.000Z");

  return {
    llmService,
    accountService,
    clock,
    mockBillingAccount: {
      id: "test-billing-account",
      defaultVirtualKeyId: "test-vk-id",
      litellmVirtualKey: "test-litellm-key",
    },
  };
}
