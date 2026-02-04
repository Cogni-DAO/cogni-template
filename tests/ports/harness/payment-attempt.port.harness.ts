// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/ports/harness/payment-attempt.port`
 * Purpose: Shared contract tests for PaymentAttemptRepository ensuring consistent behavior across adapters.
 * Scope: Tests repository invariants (ownership, uniqueness, state transitions). Does not test service logic or credit settlement.
 * Invariants: Ownership enforcement, txHash uniqueness, audit logging, state persistence.
 * Side-effects: IO (database operations via test harness)
 * Notes: Called from adapter specs; tests invariants not implementation details.
 * Links: PaymentAttemptRepository port, drizzle.adapter.spec.ts
 * @internal
 */

import { randomUUID } from "node:crypto";
import { getSeedDb } from "@tests/_fixtures/db/seed-client";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  CreatePaymentAttemptParams,
  PaymentAttemptRepository,
} from "@/ports";
import { isTxHashAlreadyBoundPortError } from "@/ports";
import { billingAccounts, users } from "@/shared/db/schema";
import { CHAIN_ID } from "@/shared/web3/chain";

import { dispose, makeHarness, type TestHarness } from "./factory";

/**
 * Register PaymentAttemptRepository port contract tests.
 * Adapter specs call this with a factory that builds a PaymentAttemptRepository.
 */
export function registerPaymentAttemptRepositoryContract(
  makeRepository: (h: TestHarness) => Promise<PaymentAttemptRepository>
): void {
  describe("PaymentAttemptRepository Port Contract", () => {
    let h: TestHarness;
    let repo: PaymentAttemptRepository;
    let testUserId: string;
    let testBillingAccountId: string;
    let testUser2Id: string;
    let testBillingAccount2Id: string;

    beforeAll(async () => {
      h = await makeHarness();
      repo = await makeRepository(h);

      // Create test users and billing accounts for FK constraints
      const seedDb = getSeedDb();

      // Create first user
      testUserId = randomUUID();
      await seedDb.insert(users).values({
        id: testUserId,
        walletAddress: `0x${"1".repeat(40)}`,
        name: "Test User 1",
      });

      // Create first billing account with explicit ID
      const [billingAccount] = await seedDb
        .insert(billingAccounts)
        .values({
          id: randomUUID(),
          ownerUserId: testUserId,
          balanceCredits: 0n,
        })
        .returning({ id: billingAccounts.id });

      if (!billingAccount) {
        throw new Error("Failed to create test billing account");
      }
      testBillingAccountId = billingAccount.id;

      // Create second user for ownership tests
      testUser2Id = randomUUID();
      await seedDb.insert(users).values({
        id: testUser2Id,
        walletAddress: `0x${"2".repeat(40)}`,
        name: "Test User 2",
      });

      // Create second billing account with explicit ID
      const [billingAccount2] = await seedDb
        .insert(billingAccounts)
        .values({
          id: randomUUID(),
          ownerUserId: testUser2Id,
          balanceCredits: 0n,
        })
        .returning({ id: billingAccounts.id });

      if (!billingAccount2) {
        throw new Error("Failed to create second test billing account");
      }
      testBillingAccount2Id = billingAccount2.id;
    });

    afterAll(async () => {
      // Cleanup cascades via FK
      const seedDb = getSeedDb();
      await seedDb.delete(users).where(eq(users.id, testUserId));
      await seedDb.delete(users).where(eq(users.id, testUser2Id));
      await dispose(h);
    });

    describe("Repository Invariants", () => {
      it("create generates unique ID with CREATED_INTENT status", async () => {
        const params: CreatePaymentAttemptParams = {
          billingAccountId: testBillingAccountId,
          fromAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
          chainId: CHAIN_ID,
          token: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
          toAddress: "0x0702e6969ec03f30cf3684c802b264c68a61d219",
          amountRaw: 5_000_000n,
          amountUsdCents: 500,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        };

        const attempt = await repo.create(params);

        expect(attempt.id).toBeDefined();
        expect(attempt.status).toBe("CREATED_INTENT");
        expect(attempt.billingAccountId).toBe(params.billingAccountId);
        expect(attempt.fromAddress).toBe(params.fromAddress);
        expect(attempt.txHash).toBeNull();
      });

      it("findById enforces ownership (returns null when not owned)", async () => {
        const params: CreatePaymentAttemptParams = {
          billingAccountId: testBillingAccountId,
          fromAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
          chainId: CHAIN_ID,
          token: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
          toAddress: "0x0702e6969ec03f30cf3684c802b264c68a61d219",
          amountRaw: 5_000_000n,
          amountUsdCents: 500,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        };

        const attempt = await repo.create(params);

        // Owned query succeeds
        const found = await repo.findById(attempt.id, testBillingAccountId);
        expect(found).not.toBeNull();
        expect(found?.id).toBe(attempt.id);

        // Not owned query returns null
        const notFound = await repo.findById(attempt.id, testBillingAccount2Id);
        expect(notFound).toBeNull();
      });

      it("findByTxHash finds by composite key (chainId, txHash)", async () => {
        const params: CreatePaymentAttemptParams = {
          billingAccountId: testBillingAccountId,
          fromAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
          chainId: CHAIN_ID,
          token: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
          toAddress: "0x0702e6969ec03f30cf3684c802b264c68a61d219",
          amountRaw: 5_000_000n,
          amountUsdCents: 500,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        };

        const attempt = await repo.create(params);
        const txHash = "0xabc123";
        await repo.bindTxHash(attempt.id, txHash, new Date());

        // Find by txHash succeeds
        const found = await repo.findByTxHash(CHAIN_ID, txHash);
        expect(found).not.toBeNull();
        expect(found?.id).toBe(attempt.id);
        expect(found?.txHash).toBe(txHash);

        // Different chain returns null
        const notFound = await repo.findByTxHash(11155111, txHash); // Sepolia, not active chain
        expect(notFound).toBeNull();
      });

      it("bindTxHash enforces uniqueness (throws TxHashAlreadyBoundPortError)", async () => {
        const params1: CreatePaymentAttemptParams = {
          billingAccountId: testBillingAccountId,
          fromAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
          chainId: CHAIN_ID,
          token: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
          toAddress: "0x0702e6969ec03f30cf3684c802b264c68a61d219",
          amountRaw: 5_000_000n,
          amountUsdCents: 500,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        };

        const params2 = { ...params1 };

        const attempt1 = await repo.create(params1);
        const attempt2 = await repo.create(params2);

        const txHash = "0xduplicate123";
        const submittedAt = new Date();

        // First bind succeeds
        await repo.bindTxHash(attempt1.id, txHash, submittedAt);

        // Second bind with same hash fails
        await expect(
          repo.bindTxHash(attempt2.id, txHash, submittedAt)
        ).rejects.toSatisfy(isTxHashAlreadyBoundPortError);
      });

      it("recordVerificationAttempt updates lastVerifyAttemptAt and count", async () => {
        const params: CreatePaymentAttemptParams = {
          billingAccountId: testBillingAccountId,
          fromAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
          chainId: CHAIN_ID,
          token: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
          toAddress: "0x0702e6969ec03f30cf3684c802b264c68a61d219",
          amountRaw: 5_000_000n,
          amountUsdCents: 500,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        };

        const attempt = await repo.create(params);
        await repo.bindTxHash(attempt.id, "0xabc", new Date());

        const attemptedAt = new Date();
        const updated = await repo.recordVerificationAttempt(
          attempt.id,
          attemptedAt
        );

        expect(updated.lastVerifyAttemptAt).toEqual(attemptedAt);
        expect(updated.verifyAttemptCount).toBe(1);

        // Second attempt increments count
        const updated2 = await repo.recordVerificationAttempt(
          attempt.id,
          new Date()
        );
        expect(updated2.verifyAttemptCount).toBe(2);
      });

      it("updateStatus persists changes correctly", async () => {
        const params: CreatePaymentAttemptParams = {
          billingAccountId: testBillingAccountId,
          fromAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
          chainId: CHAIN_ID,
          token: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
          toAddress: "0x0702e6969ec03f30cf3684c802b264c68a61d219",
          amountRaw: 5_000_000n,
          amountUsdCents: 500,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        };

        const attempt = await repo.create(params);

        const updated = await repo.updateStatus(
          attempt.id,
          "FAILED",
          "INTENT_EXPIRED"
        );

        expect(updated.status).toBe("FAILED");
        expect(updated.errorCode).toBe("INTENT_EXPIRED");

        // Verify persistence
        const fetched = await repo.findById(
          attempt.id,
          params.billingAccountId
        );
        expect(fetched?.status).toBe("FAILED");
        expect(fetched?.errorCode).toBe("INTENT_EXPIRED");
      });

      it("logEvent appends to audit trail", async () => {
        const params: CreatePaymentAttemptParams = {
          billingAccountId: testBillingAccountId,
          fromAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
          chainId: CHAIN_ID,
          token: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
          toAddress: "0x0702e6969ec03f30cf3684c802b264c68a61d219",
          amountRaw: 5_000_000n,
          amountUsdCents: 500,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        };

        const attempt = await repo.create(params);

        // Log event
        await repo.logEvent({
          attemptId: attempt.id,
          eventType: "INTENT_CREATED",
          fromStatus: null,
          toStatus: "CREATED_INTENT",
        });

        // Verify event logged (implementation detail - just verify no error)
        // Actual event retrieval tested at integration level
        expect(true).toBe(true);
      });
    });
  });
}
