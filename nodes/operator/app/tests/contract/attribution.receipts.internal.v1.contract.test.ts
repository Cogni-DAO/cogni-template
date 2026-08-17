// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/contract/attribution.receipts.internal.v1`
 * Purpose: Prove the internal receipt boundary rejects open-string and under-filled attribution context.
 * Scope: Pure Zod contract tests; no route, network, or database.
 * Invariants: RECEIPT_CONTEXT_V1_STRICT, SOURCE_PRODUCER_BOUNDED.
 * Side-effects: none
 * Links: packages/node-contracts/src/attribution.receipts.internal.v1.contract.ts, story.5023
 * @internal
 */

import { internalDeliverReceiptsOperation } from "@cogni/node-contracts";
import { describe, expect, it } from "vitest";

const NODE_ID = "11111111-1111-4111-8111-111111111111";

function validPrReceipt() {
  return {
    receiptId: "github:pr:cogni-dao/cogni:42",
    source: "github",
    eventType: "pr_merged",
    platformUserId: "12345",
    platformLogin: "human",
    artifactUrl: "https://github.com/cogni-dao/cogni/pull/42",
    metadata: {
      schemaVersion: 1,
      providerRepoId: "github-repo-node-id",
      repo: "cogni-dao/cogni",
      prNumber: 42,
      title: "Ship canonical receipts",
      body: "Context body",
      baseBranch: "main",
      branch: "feat/receipts",
      mergeCommitSha: "merge-sha",
      mergedById: "github-user-node-merger",
      commitShas: ["commit-sha"],
      labels: ["attribution"],
      additions: 10,
      deletions: 2,
      changedFiles: 3,
      action: "closed",
      extraForwardCompatibleKey: { nested: true },
    },
    payloadHash: "a".repeat(64),
    producer: "github:webhook",
    producerVersion: "0.4.0",
    eventTime: "2026-08-16T20:00:00.000Z",
    retrievedAt: "2026-08-16T20:00:01.000Z",
  };
}

function envelope(receipt = validPrReceipt()) {
  return { nodeId: NODE_ID, source: "github", receipts: [receipt] };
}

describe("internal attribution receipt v1 contract", () => {
  it("accepts full v1 context and preserves passthrough extras", () => {
    const parsed = internalDeliverReceiptsOperation.input.parse(envelope());
    expect(parsed.receipts[0]?.metadata.extraForwardCompatibleKey).toEqual({
      nested: true,
    });
  });

  it("rejects an under-filled known event instead of silently degrading attribution", () => {
    const receipt = validPrReceipt();
    const { title: _title, ...underfilled } = receipt.metadata;
    expect(
      internalDeliverReceiptsOperation.input.safeParse(
        envelope({ ...receipt, metadata: underfilled })
      ).success
    ).toBe(false);
  });

  it("rejects unknown event, source, and producer strings", () => {
    for (const change of [
      { eventType: "push" },
      { source: "gitlab" },
      { producer: "github" },
    ]) {
      expect(
        internalDeliverReceiptsOperation.input.safeParse(
          envelope({ ...validPrReceipt(), ...change })
        ).success
      ).toBe(false);
    }
  });

  it("rejects receipt/envelope source mismatch", () => {
    expect(
      internalDeliverReceiptsOperation.input.safeParse({
        ...envelope(),
        source: "alchemy",
      }).success
    ).toBe(false);
  });

  it("rejects duplicate IDs inside one delivery batch", () => {
    const receipt = validPrReceipt();
    expect(
      internalDeliverReceiptsOperation.input.safeParse({
        ...envelope(),
        receipts: [receipt, receipt],
      }).success
    ).toBe(false);
  });
});
