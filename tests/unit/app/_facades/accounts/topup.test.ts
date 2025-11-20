// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@unit/app/_facades/accounts/topup`
 * Purpose: Unit tests for topup credits facade.
 * Scope: Tests facade logic with mocked dependencies. Does not test actual database or HTTP layers.
 * Invariants: Mocked AccountService, isolated from infrastructure
 * Side-effects: none (unit tests with mocks)
 * Notes: Tests contract mapping and dependency coordination
 * Links: Tests @app/_facades/accounts/topup.server
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { topupCredits } from "@/app/_facades/accounts/topup.server";
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

describe("topupCredits facade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should topup credits with reference", async () => {
    // Arrange
    vi.mocked(mockAccountService.creditAccount).mockResolvedValue({
      newBalance: 150,
    });

    const params = {
      accountId: "key:abc123",
      input: {
        amount: 100,
        reason: "manual_topup",
        reference: "funding-001",
      },
    };

    // Act
    const result = await topupCredits(params);

    // Assert
    expect(mockAccountService.creditAccount).toHaveBeenCalledWith({
      accountId: "key:abc123",
      amount: 100,
      reason: "manual_topup",
      reference: "funding-001",
    });

    expect(result).toEqual({
      newBalance: 150,
    });
  });

  it("should topup credits without reference", async () => {
    // Arrange
    vi.mocked(mockAccountService.creditAccount).mockResolvedValue({
      newBalance: 75,
    });

    const params = {
      accountId: "key:def456",
      input: {
        amount: 75,
        reason: "test_funding",
      },
    };

    // Act
    const result = await topupCredits(params);

    // Assert
    expect(mockAccountService.creditAccount).toHaveBeenCalledWith({
      accountId: "key:def456",
      amount: 75,
      reason: "test_funding",
    });

    expect(result).toEqual({
      newBalance: 75,
    });
  });

  it("should handle account service errors", async () => {
    // Arrange
    const error = new Error("Account not found");
    vi.mocked(mockAccountService.creditAccount).mockRejectedValue(error);

    const params = {
      accountId: "key:nonexistent",
      input: {
        amount: 50,
        reason: "test",
      },
    };

    // Act & Assert
    await expect(topupCredits(params)).rejects.toThrow("Account not found");

    expect(mockAccountService.creditAccount).toHaveBeenCalledWith({
      accountId: "key:nonexistent",
      amount: 50,
      reason: "test",
    });

    // creditAccount was called but failed
    expect(mockAccountService.creditAccount).toHaveBeenCalled();
  });
});
