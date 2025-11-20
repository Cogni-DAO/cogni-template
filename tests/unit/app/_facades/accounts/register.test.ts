// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@unit/app/_facades/accounts/register`
 * Purpose: Unit tests for register account facade.
 * Scope: Tests facade logic with mocked dependencies. Does not test actual database or HTTP layers.
 * Invariants: Mocked AccountService, isolated from infrastructure
 * Side-effects: none (unit tests with mocks)
 * Notes: Tests contract mapping and dependency coordination
 * Links: Tests @app/_facades/accounts/register.server
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerAccount } from "@/app/_facades/accounts/register.server";
import type { AccountService } from "@/ports";

// Mock the bootstrap container
const mockAccountService: AccountService = {
  createAccountForApiKey: vi.fn(),
  getAccountByApiKey: vi.fn(),
  getBalance: vi.fn(),
  debitForUsage: vi.fn(),
  creditAccount: vi.fn(),
};

vi.mock("@/bootstrap/container", () => ({
  resolveAiDeps: () => ({
    accountService: mockAccountService,
    llmService: {},
    clock: {},
  }),
}));

describe("registerAccount facade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should register account with display name", async () => {
    // Arrange
    const mockResult = { accountId: "key:abc123", balanceCredits: 0 };
    vi.mocked(mockAccountService.createAccountForApiKey).mockResolvedValue(
      mockResult
    );

    const input = {
      apiKey: "test-key-123",
      displayName: "Test Account",
    };

    // Act
    const result = await registerAccount(input);

    // Assert
    expect(mockAccountService.createAccountForApiKey).toHaveBeenCalledWith({
      apiKey: "test-key-123",
      displayName: "Test Account",
    });

    expect(result).toEqual({
      accountId: "key:abc123",
      balanceCredits: 0,
    });
  });

  it("should register account without display name", async () => {
    // Arrange
    const mockResult = { accountId: "key:def456", balanceCredits: 0 };
    vi.mocked(mockAccountService.createAccountForApiKey).mockResolvedValue(
      mockResult
    );

    const input = {
      apiKey: "test-key-456",
    };

    // Act
    const result = await registerAccount(input);

    // Assert
    expect(mockAccountService.createAccountForApiKey).toHaveBeenCalledWith({
      apiKey: "test-key-456",
    });

    expect(result).toEqual({
      accountId: "key:def456",
      balanceCredits: 0,
    });
  });

  it("should handle account service errors", async () => {
    // Arrange
    const error = new Error("Database connection failed");
    vi.mocked(mockAccountService.createAccountForApiKey).mockRejectedValue(
      error
    );

    const input = {
      apiKey: "failing-key",
    };

    // Act & Assert
    await expect(registerAccount(input)).rejects.toThrow(
      "Database connection failed"
    );

    expect(mockAccountService.createAccountForApiKey).toHaveBeenCalledWith({
      apiKey: "failing-key",
    });
  });
});
