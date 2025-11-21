// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@unit/app/_facades/wallet/link`
 * Purpose: Unit tests for wallet link facade.
 * Scope: Tests facade logic with mocked dependencies. Does not test actual database or HTTP layers.
 * Invariants: Mocked AccountService, mocked environment config, isolated from infrastructure
 * Side-effects: none (unit tests with mocks)
 * Notes: Tests MVP API key resolution and account creation delegation
 * Links: Tests @app/_facades/wallet/link.server
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { linkWallet } from "@/app/_facades/wallet/link.server";
import type { AccountService } from "@/ports";
import { deriveAccountIdFromApiKey } from "@/shared/util";

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

// Mock serverEnv to provide test API key
vi.mock("@/shared/env/server", () => ({
  serverEnv: () => ({
    LITELLM_MVP_API_KEY: "test-mvp-api-key",
  }),
}));

describe("linkWallet facade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should link wallet and return accountId + apiKey", async () => {
    // Arrange
    const testApiKey = "test-mvp-api-key";
    const expectedAccountId = deriveAccountIdFromApiKey(testApiKey);
    const mockResult = { accountId: expectedAccountId, balanceCredits: 0 };
    vi.mocked(mockAccountService.createAccountForApiKey).mockResolvedValue(
      mockResult
    );

    const input = {
      address: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    };

    // Act
    const result = await linkWallet(input);

    // Assert
    expect(mockAccountService.createAccountForApiKey).toHaveBeenCalledWith({
      apiKey: testApiKey,
      displayName: "Wallet: 0x742d3...f0bEb",
    });

    expect(result).toEqual({
      accountId: expectedAccountId,
      apiKey: testApiKey,
    });
  });

  it("should format wallet addresses with first 5 and last 5 hex digits", async () => {
    // Arrange
    const mockResult = {
      accountId: "key:abc123",
      balanceCredits: 0,
    };
    vi.mocked(mockAccountService.createAccountForApiKey).mockResolvedValue(
      mockResult
    );

    const input = {
      address: "0x1234567890abcdefABCDEF1234567890abcdefAB",
    };

    // Act
    await linkWallet(input);

    // Assert
    expect(mockAccountService.createAccountForApiKey).toHaveBeenCalledWith({
      apiKey: "test-mvp-api-key",
      displayName: "Wallet: 0x12345...defAB",
    });
  });

  it("should derive stable accountId from MVP API key", async () => {
    // Arrange
    const testApiKey = "test-mvp-api-key";
    const expectedAccountId = deriveAccountIdFromApiKey(testApiKey);
    const mockResult = { accountId: expectedAccountId, balanceCredits: 0 };
    vi.mocked(mockAccountService.createAccountForApiKey).mockResolvedValue(
      mockResult
    );

    const input = {
      address: "0xAnyAddress",
    };

    // Act
    const result = await linkWallet(input);

    // Assert
    expect(result.accountId).toBe(expectedAccountId);
    expect(result.accountId).toMatch(/^key:[a-f0-9]{32}$/);
  });

  it("should handle AccountService errors", async () => {
    // Arrange
    const error = new Error("Database connection failed");
    vi.mocked(mockAccountService.createAccountForApiKey).mockRejectedValue(
      error
    );

    const input = {
      address: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    };

    // Act & Assert
    await expect(linkWallet(input)).rejects.toThrow(
      "Database connection failed"
    );

    expect(mockAccountService.createAccountForApiKey).toHaveBeenCalledTimes(1);
  });
});
