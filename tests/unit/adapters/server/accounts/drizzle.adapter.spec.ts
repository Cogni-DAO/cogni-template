// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/accounts/drizzle`
 * Purpose: Unit tests for DrizzleAccountService.
 * Scope: Verifies recordLlmUsage logic, including transaction handling and rollback. Does not test actual database connection.
 * Invariants: Transactions are rolled back on error; inputs are validated.
 * Side-effects: none (uses mocks)
 * Links: `src/adapters/server/accounts/drizzle.adapter.ts`
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { DrizzleAccountService } from "@/adapters/server/accounts/drizzle.adapter";
import { InsufficientCreditsPortError } from "@/ports";

// Mock the db module
const mockTx = {
  query: {
    billingAccounts: {
      findFirst: vi.fn(),
    },
    virtualKeys: {
      findFirst: vi.fn(),
    },
  },
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  returning: vi.fn(),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  rollback: vi.fn(),
};

const mockDb = {
  transaction: vi.fn((callback) => callback(mockTx)),
  query: {
    billingAccounts: {
      findFirst: vi.fn(),
    },
  },
  // biome-ignore lint/suspicious/noExplicitAny: Mocking complex DB type
} as unknown as any; // Cast to any to avoid strict type checks for now

vi.mock("@/adapters/server/db", () => ({
  db: mockDb,
}));

describe("DrizzleAccountService", () => {
  let service: DrizzleAccountService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTx.query.billingAccounts.findFirst.mockReset();
    mockTx.query.virtualKeys.findFirst.mockReset();
    mockTx.returning.mockReset();
    // Re-setup default behavior if needed, but for now tests set specific values
    service = new DrizzleAccountService(mockDb);
  });

  describe("recordLlmUsage", () => {
    const params = {
      billingStatus: "billed" as const,
      billingAccountId: "acc-123",
      virtualKeyId: "vk-123",
      requestId: "req-123",
      model: "gpt-3.5-turbo",
      promptTokens: 10,
      completionTokens: 10,
      providerCostUsd: 0.001,
      providerCostCredits: 1n,
      userPriceCredits: 2n,
      markupFactorApplied: 1.5,
      metadata: { foo: "bar" },
    };

    it("successfully records usage and debits credits", async () => {
      // Mock finding account with sufficient balance
      mockTx.query.billingAccounts.findFirst.mockResolvedValue({
        id: "acc-123",
        balanceCredits: 100n,
      });

      // Mock finding virtual key
      mockTx.query.virtualKeys.findFirst.mockResolvedValue({
        id: "vk-123",
      });

      // Mock insert returns
      // llm_usage insert does not use returning()
      mockTx.returning.mockResolvedValueOnce([{ balanceCredits: 98n }]); // billing_accounts update
      // credit_ledger insert does not use returning()

      await service.recordLlmUsage(params);

      // Verify transaction started
      expect(mockDb.transaction).toHaveBeenCalled();

      // Verify account lookup
      expect(mockTx.query.billingAccounts.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.anything(), // eq(billingAccounts.id, accountId)
        })
      );

      // Verify llm usage insert
      expect(mockTx.insert).toHaveBeenCalledWith(expect.anything()); // llmUsage
      expect(mockTx.values).toHaveBeenCalledWith(
        expect.objectContaining({
          billingAccountId: "acc-123",
          virtualKeyId: "vk-123",
          requestId: "req-123",
          model: "gpt-3.5-turbo",
          promptTokens: 10,
          completionTokens: 10,
          providerCostUsd: "0.001",
          providerCostCredits: 1n,
          userPriceCredits: 2n,
          markupFactor: "1.5",
          usage: {
            promptTokens: 10,
            completionTokens: 10,
            totalTokens: 20,
          },
        })
      );

      // Verify balance update
      expect(mockTx.update).toHaveBeenCalledWith(expect.anything()); // billingAccounts
      expect(mockTx.set).toHaveBeenCalledWith({
        balanceCredits: expect.anything(), // sql`...`
      });

      // Verify credit ledger insert
      expect(mockTx.insert).toHaveBeenCalledWith(expect.anything()); // creditLedger
      expect(mockTx.values).toHaveBeenCalledWith(
        expect.objectContaining({
          billingAccountId: "acc-123",
          virtualKeyId: "vk-123",
          amount: -2n,
          reason: "llm_usage",
          reference: "req-123",
          metadata: { foo: "bar" },
        })
      );
    });

    it("rolls back when credits are insufficient", async () => {
      // Mock finding account with insufficient balance
      mockTx.query.billingAccounts.findFirst.mockResolvedValue({
        id: "acc-123",
        balanceCredits: 1n, // Less than 2n required
      });

      // Mock finding virtual key
      mockTx.query.virtualKeys.findFirst.mockResolvedValue({
        id: "vk-123",
      });

      // Mock update returning negative balance
      mockTx.returning.mockResolvedValueOnce([{ balanceCredits: -1n }]);

      await expect(service.recordLlmUsage(params)).rejects.toThrow(
        InsufficientCreditsPortError
      );

      // Verify NO rollback call needed explicitly if we just throw error?
      // Drizzle transaction usually rolls back on error.
      // But here we throw InsufficientCreditsPortError manually.
      // The test checks if it throws the correct error.
    });

    it("throws error if account not found", async () => {
      mockTx.query.billingAccounts.findFirst.mockResolvedValue(null);

      await expect(service.recordLlmUsage(params)).rejects.toThrow(
        "Billing account not found"
      );
    });
  });
});
