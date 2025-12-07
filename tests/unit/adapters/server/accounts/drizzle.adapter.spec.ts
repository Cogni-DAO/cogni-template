// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/accounts/drizzle`
 * Purpose: Unit tests for DrizzleAccountService.
 * Scope: Verifies recordChargeReceipt logic per ACTIVITY_METRICS.md. Does not test actual database connection.
 * Invariants: Post-call never throws InsufficientCreditsPortError; idempotent by requestId
 * Side-effects: none (uses mocks)
 * Links: `src/adapters/server/accounts/drizzle.adapter.ts`, docs/ACTIVITY_METRICS.md
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { DrizzleAccountService } from "@/adapters/server/accounts/drizzle.adapter";

// Mock the db module
const mockTx = {
  query: {
    billingAccounts: {
      findFirst: vi.fn(),
    },
    virtualKeys: {
      findFirst: vi.fn(),
    },
    llmUsage: {
      findFirst: vi.fn(),
    },
  },
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  onConflictDoNothing: vi.fn().mockReturnThis(),
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
    mockTx.query.llmUsage.findFirst.mockReset();
    mockTx.returning.mockReset();
    mockTx.onConflictDoNothing.mockReset().mockReturnThis();
    service = new DrizzleAccountService(mockDb);
  });

  describe("recordChargeReceipt", () => {
    // Per ACTIVITY_METRICS.md: minimal charge_receipt fields
    const params = {
      billingAccountId: "acc-123",
      virtualKeyId: "vk-123",
      requestId: "req-123",
      chargedCredits: 2000n,
      responseCostUsd: 0.002,
      litellmCallId: "call-123",
      provenance: "response" as const,
    };

    it("successfully records charge receipt and debits credits", async () => {
      // Mock no existing receipt (new request)
      mockTx.query.llmUsage.findFirst.mockResolvedValue(null);

      // Mock finding account with sufficient balance
      mockTx.query.billingAccounts.findFirst.mockResolvedValue({
        id: "acc-123",
        balanceCredits: 100000n,
      });

      // Mock finding virtual key (required validation)
      mockTx.query.virtualKeys.findFirst.mockResolvedValue({
        id: "vk-123",
        billingAccountId: "acc-123",
      });

      // Mock update returning positive balance
      mockTx.returning.mockResolvedValueOnce([{ balanceCredits: 98000n }]);

      await service.recordChargeReceipt(params);

      // Verify transaction started
      expect(mockDb.transaction).toHaveBeenCalled();

      // Verify idempotency check ran
      expect(mockTx.query.llmUsage.findFirst).toHaveBeenCalled();

      // Verify charge receipt insert
      expect(mockTx.insert).toHaveBeenCalled();
      expect(mockTx.values).toHaveBeenCalledWith(
        expect.objectContaining({
          billingAccountId: "acc-123",
          virtualKeyId: "vk-123",
          requestId: "req-123",
          chargedCredits: 2000n,
          provenance: "response",
        })
      );
    });

    it("returns early without debiting if receipt already exists (idempotent)", async () => {
      // Per ACTIVITY_METRICS.md: Idempotent receipts - request_id as PK
      // Mock existing receipt found
      mockTx.query.llmUsage.findFirst.mockResolvedValue({
        id: "existing-uuid",
        requestId: "req-123",
        billingAccountId: "acc-123",
      });

      await service.recordChargeReceipt(params);

      // Verify idempotency check ran
      expect(mockTx.query.llmUsage.findFirst).toHaveBeenCalled();

      // Should NOT proceed with account validation or inserts
      expect(mockTx.query.billingAccounts.findFirst).not.toHaveBeenCalled();
      expect(mockTx.update).not.toHaveBeenCalled();
    });

    it("does NOT throw when balance goes negative (post-call is non-blocking)", async () => {
      // Per ACTIVITY_METRICS.md: recordChargeReceipt must NEVER throw InsufficientCreditsPortError
      // Mock no existing receipt
      mockTx.query.llmUsage.findFirst.mockResolvedValue(null);

      // Mock finding account with insufficient balance
      mockTx.query.billingAccounts.findFirst.mockResolvedValue({
        id: "acc-123",
        balanceCredits: 1000n, // Less than 2000n charged
      });

      // Mock finding virtual key (required validation)
      mockTx.query.virtualKeys.findFirst.mockResolvedValue({
        id: "vk-123",
        billingAccountId: "acc-123",
      });

      // Mock update returning negative balance
      mockTx.returning.mockResolvedValueOnce([{ balanceCredits: -1000n }]);

      // Should NOT throw - post-call billing is non-blocking
      await expect(service.recordChargeReceipt(params)).resolves.not.toThrow();
    });

    it("throws error if account not found", async () => {
      // Mock no existing receipt
      mockTx.query.llmUsage.findFirst.mockResolvedValue(null);
      mockTx.query.billingAccounts.findFirst.mockResolvedValue(null);

      // Account not found is a hard error (not an insufficient credits case)
      await expect(service.recordChargeReceipt(params)).rejects.toThrow(
        "Billing account not found"
      );
    });
  });
});
