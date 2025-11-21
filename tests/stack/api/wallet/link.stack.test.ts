// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@stack/api/wallet/link`
 * Purpose: Stack tests for wallet link endpoint.
 * Scope: Tests complete workflow from HTTP request to account creation. Does not test signature verification (MVP).
 * Invariants: Tests run against actual HTTP routes with real dependencies
 * Side-effects: IO (HTTP requests, database operations)
 * Notes: Requires running stack (use pnpm dev:stack:test or pnpm docker:test:stack)
 * Links: Tests /api/v1/wallet/link endpoint
 * @public
 */

import { describe, expect, it } from "vitest";

import {
  callWalletLink,
  callWalletLinkRaw,
} from "../../../_fixtures/wallet/api-helpers";
import {
  ACCOUNT_ID_FORMAT,
  SAMPLE_WALLET_ADDRESSES,
  TEST_MVP_ACCOUNT_ID,
  TEST_MVP_API_KEY,
} from "../../../_fixtures/wallet/test-data";

describe("Wallet Link Integration", () => {
  describe("POST /api/v1/wallet/link", () => {
    it("should link wallet and return accountId + apiKey", async () => {
      // Act
      const response = await callWalletLink(SAMPLE_WALLET_ADDRESSES.VALID_EVM);

      // Assert
      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data).toMatchObject({
        accountId: TEST_MVP_ACCOUNT_ID,
        apiKey: TEST_MVP_API_KEY,
      });

      // Verify accountId format (key:hash)
      expect(data.accountId).toMatch(ACCOUNT_ID_FORMAT);
    });

    it("should be idempotent - multiple links return same account", async () => {
      // Act - First link
      const response1 = await callWalletLink(
        SAMPLE_WALLET_ADDRESSES.VALID_EVM_2
      );
      expect(response1.status).toBe(200);
      const data1 = await response1.json();

      // Act - Second link (same wallet)
      const response2 = await callWalletLink(
        SAMPLE_WALLET_ADDRESSES.VALID_EVM_2
      );
      expect(response2.status).toBe(200);
      const data2 = await response2.json();

      // Assert - Same account returned both times
      expect(data1.accountId).toBe(data2.accountId);
      expect(data1.apiKey).toBe(data2.apiKey);
      expect(data1.accountId).toBe(TEST_MVP_ACCOUNT_ID);
    });

    it("should reject request with missing address", async () => {
      // Act
      const response = await callWalletLinkRaw({});

      // Assert
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBeTruthy();
    });

    it("should reject request with empty address", async () => {
      // Act
      const response = await callWalletLink("");

      // Assert
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBeTruthy();
    });

    it("should reject request with invalid JSON", async () => {
      // Act
      const response = await callWalletLinkRaw("invalid-json");

      // Assert
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Invalid JSON body");
    });

    it("should accept any non-empty string as address (MVP)", async () => {
      // Act - MVP doesn't validate EVM address format
      const response = await callWalletLink(SAMPLE_WALLET_ADDRESSES.NON_EVM);

      // Assert - Should succeed (MVP validation)
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.accountId).toBe(TEST_MVP_ACCOUNT_ID);
      expect(data.apiKey).toBe(TEST_MVP_API_KEY);
    });
  });

  describe("Wallet Link + AI Completion Flow", () => {
    it("should enable AI calls after wallet link", async () => {
      // Step 1: Link wallet
      const linkResponse = await callWalletLink(
        SAMPLE_WALLET_ADDRESSES.VALID_EVM_3
      );

      expect(linkResponse.status).toBe(200);
      const { accountId, apiKey } = await linkResponse.json();

      // Step 2: Verify account structure
      expect(accountId).toBe(TEST_MVP_ACCOUNT_ID);
      expect(apiKey).toBe(TEST_MVP_API_KEY);

      // Future test: After admin funds the account, verify AI completion works
      // This requires the full workflow in a separate test with admin token
    });
  });
});
