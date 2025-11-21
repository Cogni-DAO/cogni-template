// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@unit/contracts/wallet.link.v1.contract`
 * Purpose: Unit tests for wallet link contract validation.
 * Scope: Tests Zod schema validation and type inference. Does not test business logic.
 * Invariants: Contract schema validates correctly
 * Side-effects: none (unit tests)
 * Notes: Verifies contract shapes match expectations for frontend and backend
 * Links: Tests @contracts/wallet.link.v1.contract
 */

import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import {
  type WalletLinkInput,
  walletLinkOperation,
  type WalletLinkOutput,
} from "@/contracts/wallet.link.v1.contract";

describe("walletLinkOperation contract", () => {
  describe("metadata", () => {
    it("should have correct operation id", () => {
      expect(walletLinkOperation.id).toBe("wallet.link.v1");
    });

    it("should have summary and description", () => {
      expect(walletLinkOperation.summary).toBeTruthy();
      expect(walletLinkOperation.description).toBeTruthy();
    });
  });

  describe("input validation", () => {
    it("should accept valid wallet address", () => {
      const validInput = {
        address: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
      };

      const result = walletLinkOperation.input.parse(validInput);

      expect(result).toEqual(validInput);
    });

    it("should accept any non-empty string as address (MVP)", () => {
      const validInput = {
        address: "any-string-for-mvp",
      };

      const result = walletLinkOperation.input.parse(validInput);

      expect(result).toEqual(validInput);
    });

    it("should reject empty address", () => {
      const invalidInput = {
        address: "",
      };

      expect(() => walletLinkOperation.input.parse(invalidInput)).toThrow(
        ZodError
      );
    });

    it("should reject missing address field", () => {
      const invalidInput = {};

      expect(() => walletLinkOperation.input.parse(invalidInput)).toThrow(
        ZodError
      );
    });

    it("should reject null address", () => {
      const invalidInput = {
        address: null,
      };

      expect(() => walletLinkOperation.input.parse(invalidInput)).toThrow(
        ZodError
      );
    });
  });

  describe("output validation", () => {
    it("should accept valid output with accountId and apiKey", () => {
      const validOutput = {
        accountId: "key:abc123def456",
        apiKey: "sk-test-key-123",
      };

      const result = walletLinkOperation.output.parse(validOutput);

      expect(result).toEqual(validOutput);
    });

    it("should reject output missing accountId", () => {
      const invalidOutput = {
        apiKey: "sk-test-key-123",
      };

      expect(() => walletLinkOperation.output.parse(invalidOutput)).toThrow(
        ZodError
      );
    });

    it("should reject output missing apiKey", () => {
      const invalidOutput = {
        accountId: "key:abc123def456",
      };

      expect(() => walletLinkOperation.output.parse(invalidOutput)).toThrow(
        ZodError
      );
    });
  });

  describe("type inference", () => {
    it("should infer correct input type", () => {
      // Type-level test - will fail compilation if types are wrong
      const input: WalletLinkInput = {
        address: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
      };

      expect(input.address).toBeDefined();
    });

    it("should infer correct output type", () => {
      // Type-level test - will fail compilation if types are wrong
      const output: WalletLinkOutput = {
        accountId: "key:abc123",
        apiKey: "sk-test-key",
      };

      expect(output.accountId).toBeDefined();
      expect(output.apiKey).toBeDefined();
    });
  });
});
