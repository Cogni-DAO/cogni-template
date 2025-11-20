// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/accounts/drizzle`
 * Purpose: Unit tests for DrizzleAccountService with mocked database operations and business logic validation.
 * Scope: Tests adapter logic, error handling, transaction behavior. Does NOT test real database.
 * Invariants: No real database calls; deterministic responses; validates AccountService contract compliance
 * Side-effects: none (mocked database)
 * Notes: Tests credit operations, balance calculations, error conditions, transaction rollback behavior
 * Links: src/adapters/server/accounts/drizzle.adapter.ts, AccountService port
 * @public
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { DrizzleAccountService } from "@/adapters/server/accounts/drizzle.adapter";
import type { Database } from "@/adapters/server/db/client";
import {
  AccountNotFoundPortError,
  type AccountService,
  InsufficientCreditsPortError,
} from "@/ports";

// Type definitions for mocks
interface MockTransaction {
  query: {
    accounts: {
      findFirst: ReturnType<typeof vi.fn>;
    };
  };
  insert: ReturnType<typeof vi.fn>;
  values: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  returning: ReturnType<typeof vi.fn>;
}

// Mock the shared utilities
vi.mock("@/shared/util", () => ({
  deriveAccountIdFromApiKey: vi.fn(
    (apiKey: string) => `key:${apiKey.slice(-8)}`
  ),
}));

// Mock the database schema
vi.mock("@/shared/db", () => ({
  accounts: {
    id: "accounts.id",
    balanceCredits: "accounts.balanceCredits",
    displayName: "accounts.displayName",
  },
  creditLedger: {
    accountId: "creditLedger.accountId",
    delta: "creditLedger.delta",
    reason: "creditLedger.reason",
    reference: "creditLedger.reference",
    metadata: "creditLedger.metadata",
  },
}));

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((field, value) => ({ field, value, op: "eq" })),
  sql: vi.fn((template, ...values) => ({ template, values, op: "sql" })),
}));

describe("DrizzleAccountService", () => {
  let service: AccountService;
  let mockDb: {
    transaction: ReturnType<typeof vi.fn>;
    query: { accounts: { findFirst: ReturnType<typeof vi.fn> } };
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let mockTransaction: MockTransaction;

  // Test fixtures
  const testData = {
    apiKey: "sk-test1234567890abcdef",
    accountId: "key:90abcdef",
    account: {
      id: "key:90abcdef",
      balanceCredits: "50.00",
      displayName: "Test Account",
    },
    debitParams: {
      accountId: "key:90abcdef",
      cost: 10.5,
      requestId: "req-123",
      metadata: { model: "gpt-4", tokens: 100 },
    },
    creditParams: {
      accountId: "key:90abcdef",
      amount: 25.75,
      reason: "admin_topup",
      reference: "ref-456",
    },
  };

  // Mock helpers
  const mockHelpers = {
    mockAccountExists: (
      account: typeof testData.account = testData.account
    ) => {
      mockTransaction.query.accounts.findFirst.mockResolvedValueOnce(account);
    },
    mockAccountNotFound: () => {
      mockTransaction.query.accounts.findFirst.mockResolvedValueOnce(null);
    },
    mockSuccessfulUpdate: (balanceCredits: string) => {
      mockTransaction.returning.mockResolvedValueOnce([{ balanceCredits }]);
    },
    mockFailedUpdate: () => {
      mockTransaction.returning.mockResolvedValueOnce([]);
    },
    setupTransaction: (callback?: () => void) => {
      mockDb.transaction.mockImplementation((txCallback) => {
        if (callback) callback();
        return txCallback(mockTransaction);
      });
    },
  };

  beforeEach(() => {
    mockTransaction = {
      query: {
        accounts: {
          findFirst: vi.fn(),
        },
      },
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn(),
    };

    mockDb = {
      transaction: vi.fn(),
      query: {
        accounts: {
          findFirst: vi.fn(),
        },
      },
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
    };

    service = new DrizzleAccountService(mockDb as unknown as Database);
  });

  describe("createAccountForApiKey", () => {
    it("creates new account when it doesn't exist", async () => {
      mockHelpers.setupTransaction(() => {
        mockHelpers.mockAccountNotFound();
      });

      const result = await service.createAccountForApiKey({
        apiKey: testData.apiKey,
        displayName: "Test Account",
      });

      expect(result).toEqual({
        accountId: testData.accountId,
        balanceCredits: 0,
      });

      expect(mockTransaction.insert).toHaveBeenCalled();
      expect(mockTransaction.values).toHaveBeenCalledWith({
        id: testData.accountId,
        balanceCredits: "0.00",
        displayName: "Test Account",
      });
    });

    it("is idempotent when account already exists", async () => {
      mockHelpers.setupTransaction(() => {
        mockHelpers.mockAccountExists();
      });

      const result = await service.createAccountForApiKey({
        apiKey: testData.apiKey,
        displayName: "Test Account",
      });

      expect(result).toEqual({
        accountId: testData.accountId,
        balanceCredits: 0, // Always returns 0 for consistency
      });

      expect(mockTransaction.insert).not.toHaveBeenCalled();
    });

    it("handles account creation without display name", async () => {
      mockHelpers.setupTransaction(() => {
        mockHelpers.mockAccountNotFound();
      });

      await service.createAccountForApiKey({
        apiKey: testData.apiKey,
      });

      expect(mockTransaction.values).toHaveBeenCalledWith({
        id: testData.accountId,
        balanceCredits: "0.00",
        displayName: null,
      });
    });
  });

  describe("getAccountByApiKey", () => {
    it("returns account data when account exists", async () => {
      const accountWithBalance = {
        ...testData.account,
        balanceCredits: "123.45",
      };
      mockDb.query.accounts.findFirst.mockResolvedValueOnce(accountWithBalance);

      const result = await service.getAccountByApiKey(testData.apiKey);

      expect(result).toEqual({
        accountId: testData.accountId,
        balanceCredits: 123.45,
      });
    });

    it("returns null when account doesn't exist", async () => {
      mockDb.query.accounts.findFirst.mockResolvedValueOnce(null);

      const result = await service.getAccountByApiKey(testData.apiKey);

      expect(result).toBeNull();
    });
  });

  describe("getBalance", () => {
    it("returns balance when account exists", async () => {
      const accountWithBalance = {
        ...testData.account,
        balanceCredits: "67.89",
      };
      mockDb.query.accounts.findFirst.mockResolvedValueOnce(accountWithBalance);

      const result = await service.getBalance(testData.accountId);

      expect(result).toBe(67.89);
    });

    it("throws AccountNotFoundPortError when account doesn't exist", async () => {
      mockDb.query.accounts.findFirst.mockResolvedValueOnce(null);

      await expect(service.getBalance(testData.accountId)).rejects.toThrow(
        AccountNotFoundPortError
      );
      await expect(service.getBalance(testData.accountId)).rejects.toThrow(
        `Account not found: ${testData.accountId}`
      );
    });
  });

  describe("debitForUsage", () => {
    it("successfully debits credits and updates balance", async () => {
      mockHelpers.setupTransaction(() => {
        mockHelpers.mockAccountExists();
        mockHelpers.mockSuccessfulUpdate("39.50");
      });

      await service.debitForUsage(testData.debitParams);

      // Verify ledger entry insertion
      expect(mockTransaction.insert).toHaveBeenCalled();
      expect(mockTransaction.values).toHaveBeenCalledWith({
        accountId: testData.accountId,
        delta: "-10.50",
        reason: "ai_usage",
        reference: "req-123",
        metadata: { model: "gpt-4", tokens: 100 },
      });

      // Verify balance update
      expect(mockTransaction.update).toHaveBeenCalled();
      expect(mockTransaction.set).toHaveBeenCalled();
    });

    it("handles debit without metadata", async () => {
      mockHelpers.setupTransaction(() => {
        mockHelpers.mockAccountExists();
        mockHelpers.mockSuccessfulUpdate("39.50");
      });

      const { metadata: _metadata, ...paramsWithoutMetadata } =
        testData.debitParams;

      await service.debitForUsage(paramsWithoutMetadata);

      expect(mockTransaction.values).toHaveBeenCalledWith({
        accountId: testData.accountId,
        delta: "-10.50",
        reason: "ai_usage",
        reference: "req-123",
        metadata: null,
      });
    });

    it("throws InsufficientCreditsPortError when balance would go negative", async () => {
      mockHelpers.setupTransaction(() => {
        mockHelpers.mockAccountExists();
        mockHelpers.mockSuccessfulUpdate("-5.50"); // Insufficient funds
      });

      await expect(service.debitForUsage(testData.debitParams)).rejects.toThrow(
        InsufficientCreditsPortError
      );

      const error = await service
        .debitForUsage(testData.debitParams)
        .catch((e) => e);

      expect(error.accountId).toBe(testData.accountId);
      expect(error.cost).toBe(10.5);
      expect(error.previousBalance).toBe(5); // 10.5 + (-5.5) = 5
    });

    it("handles edge case where previous balance was already negative", async () => {
      mockHelpers.setupTransaction(() => {
        mockHelpers.mockAccountExists();
        mockHelpers.mockSuccessfulUpdate("-20.50"); // Was already negative
      });

      const error = await service
        .debitForUsage(testData.debitParams)
        .catch((e) => e);

      expect(error).toBeInstanceOf(InsufficientCreditsPortError);
      expect(error.previousBalance).toBe(0); // Clamped to 0 when negative
    });

    it("throws AccountNotFoundPortError when account doesn't exist", async () => {
      mockHelpers.setupTransaction(() => {
        mockHelpers.mockAccountNotFound();
      });

      await expect(service.debitForUsage(testData.debitParams)).rejects.toThrow(
        AccountNotFoundPortError
      );
    });

    it("throws AccountNotFoundPortError when update returns no rows", async () => {
      mockHelpers.setupTransaction(() => {
        mockHelpers.mockAccountExists();
        mockHelpers.mockFailedUpdate();
      });

      await expect(service.debitForUsage(testData.debitParams)).rejects.toThrow(
        AccountNotFoundPortError
      );
    });
  });

  describe("creditAccount", () => {
    it("successfully credits account and returns new balance", async () => {
      mockHelpers.setupTransaction(() => {
        mockHelpers.mockAccountExists();
        mockHelpers.mockSuccessfulUpdate("75.75");
      });

      const result = await service.creditAccount(testData.creditParams);

      expect(result).toEqual({ newBalance: 75.75 });

      // Verify ledger entry insertion
      expect(mockTransaction.insert).toHaveBeenCalled();
      expect(mockTransaction.values).toHaveBeenCalledWith({
        accountId: testData.accountId,
        delta: "25.75",
        reason: "admin_topup",
        reference: "ref-456",
        metadata: null,
      });
    });

    it("handles credit without reference", async () => {
      mockHelpers.setupTransaction(() => {
        mockHelpers.mockAccountExists();
        mockHelpers.mockSuccessfulUpdate("75.75");
      });

      const { reference: _reference, ...paramsWithoutRef } =
        testData.creditParams;

      await service.creditAccount(paramsWithoutRef);

      expect(mockTransaction.values).toHaveBeenCalledWith({
        accountId: testData.accountId,
        delta: "25.75",
        reason: "admin_topup",
        reference: null,
        metadata: null,
      });
    });

    it("throws AccountNotFoundPortError when account doesn't exist during check", async () => {
      mockHelpers.setupTransaction(() => {
        mockHelpers.mockAccountNotFound();
      });

      await expect(
        service.creditAccount(testData.creditParams)
      ).rejects.toThrow(AccountNotFoundPortError);
    });

    it("throws AccountNotFoundPortError when update returns no rows", async () => {
      mockHelpers.setupTransaction(() => {
        mockHelpers.mockAccountExists();
        mockHelpers.mockFailedUpdate();
      });

      await expect(
        service.creditAccount(testData.creditParams)
      ).rejects.toThrow(AccountNotFoundPortError);
    });
  });

  describe("private helper methods", () => {
    describe("number conversion", () => {
      it("converts decimal strings to numbers correctly", async () => {
        const mockAccount = {
          id: testData.accountId,
          balanceCredits: "123.45",
        };

        mockDb.query.accounts.findFirst.mockResolvedValueOnce(mockAccount);

        const result = await service.getBalance(testData.accountId);
        expect(result).toBe(123.45);
      });

      it("handles integer decimal strings", async () => {
        const mockAccount = {
          id: testData.accountId,
          balanceCredits: "100.00",
        };

        mockDb.query.accounts.findFirst.mockResolvedValueOnce(mockAccount);

        const result = await service.getBalance(testData.accountId);
        expect(result).toBe(100);
      });

      it("formats numbers to proper decimal precision for database", async () => {
        mockHelpers.setupTransaction(() => {
          mockHelpers.mockAccountExists();
          mockHelpers.mockSuccessfulUpdate("25.33");
        });

        // Test with number that needs rounding
        await service.debitForUsage({
          accountId: testData.accountId,
          cost: 10.333, // Should be rounded to 10.33
          requestId: "req-123",
        });

        expect(mockTransaction.values).toHaveBeenCalledWith(
          expect.objectContaining({
            delta: "-10.33", // Properly formatted
          })
        );
      });
    });
  });

  describe("AccountService interface compliance", () => {
    it("implements AccountService interface correctly", () => {
      const accountService: AccountService = service;
      expect(accountService.createAccountForApiKey).toBeTypeOf("function");
      expect(accountService.getAccountByApiKey).toBeTypeOf("function");
      expect(accountService.getBalance).toBeTypeOf("function");
      expect(accountService.debitForUsage).toBeTypeOf("function");
      expect(accountService.creditAccount).toBeTypeOf("function");
    });

    it("all methods return promises", async () => {
      // Properly mock all database operations
      mockDb.query.accounts.findFirst.mockResolvedValue({
        id: "test",
        balanceCredits: "0.00",
      });
      mockDb.transaction.mockImplementation((callback) => {
        mockTransaction.query.accounts.findFirst.mockResolvedValueOnce({
          id: "test",
        });
        mockTransaction.returning.mockResolvedValueOnce([
          { balanceCredits: "0.00" },
        ]);
        return callback(mockTransaction);
      });

      // Test that methods return promises without executing them
      const createPromise = service.createAccountForApiKey({ apiKey: "test" });
      const getByKeyPromise = service.getAccountByApiKey("test");
      const getBalancePromise = service.getBalance("test");
      const debitPromise = service.debitForUsage({
        accountId: "test",
        cost: 1,
        requestId: "test",
      });
      const creditPromise = service.creditAccount({
        accountId: "test",
        amount: 1,
        reason: "test",
      });

      expect(createPromise).toBeInstanceOf(Promise);
      expect(getByKeyPromise).toBeInstanceOf(Promise);
      expect(getBalancePromise).toBeInstanceOf(Promise);
      expect(debitPromise).toBeInstanceOf(Promise);
      expect(creditPromise).toBeInstanceOf(Promise);

      // Await all promises to prevent unhandled rejections
      await Promise.all([
        createPromise,
        getByKeyPromise,
        getBalancePromise,
        debitPromise,
        creditPromise,
      ]);
    });
  });
});
