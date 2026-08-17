// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/attribution-ledger/tests/receipt-content`
 * Purpose: Adversarial duplicate-vs-conflict classification for deterministic receipt IDs.
 * Scope: Pure semantic equality. Does not exercise database transaction behavior; component tests cover that seam.
 * Invariants: PROVENANCE_MAY_DIFFER, ATTRIBUTION_CONTEXT_MUST_MATCH.
 * Side-effects: none
 * Links: story.5023
 * @internal
 */

import type { InsertReceiptParams } from "@cogni/attribution-ledger";
import { sameReceiptSemanticContent } from "@cogni/attribution-ledger";
import { describe, expect, it } from "vitest";

function receipt(
  overrides: Partial<InsertReceiptParams> = {}
): InsertReceiptParams {
  return {
    receiptId: "github:pr:cogni-dao/node:42",
    nodeId: "11111111-1111-4111-8111-111111111111",
    source: "github",
    eventType: "pr_merged",
    platformUserId: "12345",
    platformLogin: "human",
    artifactUrl: "https://github.com/cogni-dao/node/pull/42",
    metadata: {
      schemaVersion: 1,
      repo: "cogni-dao/node",
      title: "Full context",
    },
    payloadHash: "a".repeat(64),
    producer: "github:webhook",
    producerVersion: "0.4.0",
    eventTime: new Date("2026-08-16T20:00:00.000Z"),
    retrievedAt: new Date("2026-08-16T20:00:01.000Z"),
    ...overrides,
  };
}

describe("sameReceiptSemanticContent", () => {
  it("classifies same ID/content from webhook and poll as a duplicate", () => {
    const webhook = receipt();
    const poll = receipt({
      producer: "github:poll",
      retrievedAt: new Date("2026-08-17T00:00:00.000Z"),
      platformLogin: "renamed-human",
    });
    expect(sameReceiptSemanticContent(webhook, poll)).toBe(true);
  });

  it("classifies same ID with different attribution context as a conflict", () => {
    const full = receipt();
    const lowerFidelity = receipt({
      metadata: {
        schemaVersion: 1,
        repo: "cogni-dao/node",
        title: "",
      },
      payloadHash: "b".repeat(64),
      producer: "github:poll",
    });
    expect(sameReceiptSemanticContent(full, lowerFidelity)).toBe(false);
  });
});
