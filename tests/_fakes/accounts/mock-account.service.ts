// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/_fakes/accounts/mock-account`
 * Purpose: Mock AccountService fixture for unit testing.
 * Scope: Test double with vi.fn() mocks for controllable behavior. Does not persist data.
 * Invariants: Returns proper mock functions for all AccountService methods
 * Side-effects: none (mock only)
 * Notes: Used for unit tests that need to mock the AccountService port
 * Links: Implements AccountService port interface
 * @public
 */

import { vi } from "vitest";

import type { AccountService } from "@/ports";

/**
 * Creates a mock AccountService with vi.fn() for all methods
 * Allows tests to control behavior and verify interactions
 */
export function createMockAccountService(): AccountService {
  return {
    createAccountForApiKey: vi.fn(),
    getAccountByApiKey: vi.fn(),
    getBalance: vi.fn(),
    debitForUsage: vi.fn(),
    creditAccount: vi.fn(),
  };
}

/**
 * Creates a mock AccountService with default successful implementations
 * Useful for tests that need the service to "just work" without specific assertions
 */
export function createMockAccountServiceWithDefaults(): AccountService {
  return {
    createAccountForApiKey: vi.fn().mockResolvedValue({
      accountId: "test-account-id",
      balanceCredits: 0,
    }),
    getAccountByApiKey: vi.fn().mockResolvedValue({
      accountId: "test-account-id",
      balanceCredits: 100,
    }),
    getBalance: vi.fn().mockResolvedValue(100),
    debitForUsage: vi.fn().mockResolvedValue(undefined),
    creditAccount: vi.fn().mockResolvedValue({ newBalance: 150 }),
  };
}
