// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/unit/adapters/server/ai/langgraph/dev/thread.spec`
 * Purpose: Unit tests for LangGraph thread ID derivation.
 * Scope: Tests UUIDv5 derivation, tenant isolation, determinism. Does NOT test thread lifecycle.
 * Invariants:
 *   - THREAD_ID_IS_UUID: Output is valid UUID format
 *   - THREAD_ID_TENANT_SCOPED: Different billingAccountId → different threadId
 *   - DETERMINISTIC: Same inputs → same output
 * Side-effects: none
 * Links: src/adapters/server/ai/langgraph/dev/thread.ts
 * @public
 */

import { describe, expect, it } from "vitest";

import {
  buildThreadMetadata,
  deriveThreadUuid,
} from "@/adapters/server/ai/langgraph/dev/thread";

// UUID v4/v5 format regex
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("adapters/server/ai/langgraph/dev/thread", () => {
  describe("deriveThreadUuid", () => {
    it("returns valid UUID format", () => {
      const result = deriveThreadUuid("account-123", "thread-abc");

      expect(result).toMatch(UUID_REGEX);
    });

    it("is deterministic - same inputs produce same output", () => {
      const billingAccountId = "acc-deterministic-test";
      const threadKey = "thread-key-123";

      const result1 = deriveThreadUuid(billingAccountId, threadKey);
      const result2 = deriveThreadUuid(billingAccountId, threadKey);
      const result3 = deriveThreadUuid(billingAccountId, threadKey);

      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
    });

    it("different threadKey produces different UUID", () => {
      const billingAccountId = "acc-same";

      const result1 = deriveThreadUuid(billingAccountId, "thread-1");
      const result2 = deriveThreadUuid(billingAccountId, "thread-2");

      expect(result1).not.toBe(result2);
    });

    describe("tenant isolation (THREAD_ID_TENANT_SCOPED)", () => {
      it("same threadKey, different billingAccountId → different threadId", () => {
        const threadKey = "shared-thread-key";

        const tenantA = deriveThreadUuid("tenant-a", threadKey);
        const tenantB = deriveThreadUuid("tenant-b", threadKey);

        expect(tenantA).not.toBe(tenantB);
      });

      it("prevents cross-tenant thread access with identical keys", () => {
        // Simulates attack vector: attacker guesses victim's threadKey
        const victimAccount = "victim-billing-account-id";
        const attackerAccount = "attacker-billing-account-id";
        const guessedThreadKey = "common-thread-key";

        const victimThreadId = deriveThreadUuid(
          victimAccount,
          guessedThreadKey
        );
        const attackerThreadId = deriveThreadUuid(
          attackerAccount,
          guessedThreadKey
        );

        // Even with same threadKey, UUIDs differ → no cross-tenant access
        expect(victimThreadId).not.toBe(attackerThreadId);
      });

      it("produces distinct UUIDs for multiple tenants", () => {
        const threadKey = "conversation-1";
        const tenants = [
          "tenant-alpha",
          "tenant-beta",
          "tenant-gamma",
          "tenant-delta",
        ];

        const threadIds = tenants.map((t) => deriveThreadUuid(t, threadKey));
        const uniqueIds = new Set(threadIds);

        // All should be unique
        expect(uniqueIds.size).toBe(tenants.length);
      });
    });

    it("handles empty strings gracefully", () => {
      // Edge case: empty inputs should still produce valid UUID
      const result = deriveThreadUuid("", "");

      expect(result).toMatch(UUID_REGEX);
    });

    it("handles special characters in inputs", () => {
      const result = deriveThreadUuid(
        "account:with:colons",
        "thread/with/slashes"
      );

      expect(result).toMatch(UUID_REGEX);
    });
  });

  describe("buildThreadMetadata", () => {
    it("returns metadata object with correct fields", () => {
      const billingAccountId = "acc-123";
      const threadKey = "thread-456";

      const metadata = buildThreadMetadata(billingAccountId, threadKey);

      expect(metadata).toEqual({
        billingAccountId: "acc-123",
        threadKey: "thread-456",
      });
    });

    it("preserves original values without transformation", () => {
      const billingAccountId = "UPPER-case-123";
      const threadKey = "Special_Chars-./";

      const metadata = buildThreadMetadata(billingAccountId, threadKey);

      expect(metadata.billingAccountId).toBe(billingAccountId);
      expect(metadata.threadKey).toBe(threadKey);
    });
  });
});
