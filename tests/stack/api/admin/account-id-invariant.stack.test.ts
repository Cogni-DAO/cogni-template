// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/integration/api/admin/account-id-invariant`
 * Purpose: Verifies exact accountId mapping invariant between register endpoint and database.
 * Scope: Covers account creation ID derivation. Does not cover credit operations or authentication.
 * Invariants: Register endpoint creates account where accounts.id === deriveAccountIdFromApiKey(apiKey)
 * Side-effects: IO (HTTP, database)
 * Notes: Uses specific API key from failing tests to isolate root cause of ID mapping
 * Links: deriveAccountIdFromApiKey utility, admin register endpoint
 * @public
 */

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/adapters/server/db/client";
import { accounts } from "@/shared/db";
import { deriveAccountIdFromApiKey } from "@/shared/util";

const API_BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";

describe("Account ID Invariant", () => {
  // Use unique API key for invariant test
  const apiKey = "test-litellm-key-invariant-12345";
  const expectedAccountId = deriveAccountIdFromApiKey(apiKey);

  // No cleanup needed - each test run gets fresh Testcontainers database

  it("register endpoint MUST create account with deriveAccountIdFromApiKey(apiKey)", async () => {
    // Act: Call the register endpoint with the exact API key
    const registerResponse = await fetch(
      `${API_BASE}/api/admin/accounts/register-litellm-key`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer admin-test-key",
        },
        body: JSON.stringify({
          apiKey,
          displayName: "Account ID Invariant Test",
        }),
      }
    );

    // Debug the register response if it fails
    if (registerResponse.status !== 201) {
      const errorText = await registerResponse.text();
      console.log(
        `❌ Register failed with ${registerResponse.status}:`,
        errorText
      );
    }

    // Verify the register call succeeds
    expect(registerResponse.status).toBe(201);
    const registerData = await registerResponse.json();

    // CRITICAL INVARIANT: The response accountId must match our derivation
    expect(registerData.accountId).toBe(expectedAccountId);

    // CRITICAL INVARIANT: Query DB directly to verify exactly one row exists
    const accountsInDb = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, expectedAccountId));

    // Assert exactly one row exists
    expect(accountsInDb).toHaveLength(1);

    // Assert the account ID in the database matches our expectation
    expect(accountsInDb[0]?.id).toBe(expectedAccountId);

    console.log(`✅ INVARIANT VERIFIED:`);
    console.log(`   API Key: ${apiKey}`);
    console.log(`   Expected Account ID: ${expectedAccountId}`);
    console.log(`   Response Account ID: ${registerData.accountId}`);
    console.log(`   Database Account ID: ${accountsInDb[0]?.id}`);
    console.log(`   Match: ${accountsInDb[0]?.id === expectedAccountId}`);
  });
});
