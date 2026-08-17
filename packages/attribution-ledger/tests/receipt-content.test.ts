// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/attribution-ledger/tests/receipt-content`
 * Purpose: Adversarial duplicate-vs-conflict classification for deterministic receipt IDs.
 * Scope: Pure economic-content equality. Does not exercise database transaction behavior; component tests cover that seam.
 * Invariants: PROVENANCE_MAY_DIFFER, ATTRIBUTION_CONTEXT_MUST_MATCH.
 * Side-effects: none
 * Links: task.5023
 * @internal
 */

import type { InsertReceiptParams } from "@cogni/attribution-ledger";
import { sameReceiptEconomicContent } from "@cogni/attribution-ledger";
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

describe("sameReceiptEconomicContent", () => {
  it("classifies mutable poll enrichment as the same economic receipt", () => {
    const webhook = receipt();
    const poll = receipt({
      producer: "github:poll",
      retrievedAt: new Date("2026-08-17T00:00:00.000Z"),
      platformLogin: "renamed-human",
      artifactUrl: "https://github.com/cogni-dao/renamed-node/pull/42",
      metadata: {
        schemaVersion: 1,
        providerRepoId: "github-repo-node-id",
        repo: "cogni-dao/renamed-node",
        title: "Edited after merge",
        body: "Edited body",
        labels: ["later-label"],
        state: "dismissed",
      },
    });
    expect(sameReceiptEconomicContent(webhook, poll)).toBe(true);
  });

  it("classifies a different economic hash as a conflict", () => {
    const full = receipt();
    const differentEconomicContent = receipt({
      metadata: {
        schemaVersion: 1,
        repo: "cogni-dao/node",
        additions: 999,
      },
      payloadHash: "b".repeat(64),
      producer: "github:poll",
    });
    expect(sameReceiptEconomicContent(full, differentEconomicContent)).toBe(
      false
    );
  });
});
