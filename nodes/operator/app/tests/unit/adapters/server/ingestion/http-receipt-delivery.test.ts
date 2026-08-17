// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/unit/adapters/server/ingestion/http-receipt-delivery`
 * Purpose: Prove deterministic receipt conflicts are surfaced as permanent delivery failures.
 * Scope: HTTP adapter with mocked fetch; no network or database.
 * Invariants: RECEIPT_CONFLICT_NOT_RETRYABLE.
 * Side-effects: none
 * Links: src/adapters/server/ingestion/http-receipt-delivery.ts, story.5023
 * @internal
 */

import {
  buildGitHubPrMergedContextV1,
  hashReceiptEconomicContent,
} from "@cogni/ingestion-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createHttpReceiptDelivery,
  ReceiptDeliveryError,
} from "@/adapters/server/ingestion/http-receipt-delivery";

const NODE_ID = "11111111-1111-4111-8111-111111111111";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HttpReceiptDelivery", () => {
  it("treats receiver content conflict as permanent", async () => {
    const metadata = buildGitHubPrMergedContextV1({
      providerRepoId: "github-repo-node-id",
      repo: "cogni-dao/node",
      prNumber: 42,
      title: "Contribution",
      body: "",
      baseBranch: "main",
      branch: "feat/context",
      mergeCommitSha: "merge-sha",
      mergedById: "github-user-node-merger",
      commitShas: ["commit-sha"],
      labels: [],
      additions: 1,
      deletions: 0,
      changedFiles: 1,
    });
    const eventTime = new Date("2026-08-16T20:00:00.000Z");
    const receiptId = "github:pr:cogni-dao/node:42";
    const artifactUrl = "https://github.com/cogni-dao/node/pull/42";
    const payloadHash = await hashReceiptEconomicContent({
      receiptId,
      source: "github",
      eventType: "pr_merged",
      platformUserId: "12345",
      artifactUrl,
      metadata,
      eventTime,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: false,
            conflicts: 1,
            conflictReceiptIds: [receiptId],
          }),
          { status: 409 }
        )
      )
    );
    const delivery = createHttpReceiptDelivery({
      resolveNodeUrl: async () => "https://node.example",
      schedulerApiToken: "token",
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        child: vi.fn(),
      } as never,
    });

    const deliveryPromise = delivery.deliverReceipts(NODE_ID, "github", [
      {
        receiptId,
        nodeId: NODE_ID,
        source: "github",
        eventType: "pr_merged",
        platformUserId: "12345",
        platformLogin: "human",
        artifactUrl,
        metadata,
        payloadHash,
        producer: "github:webhook",
        producerVersion: "0.4.0",
        eventTime,
        retrievedAt: new Date("2026-08-16T20:00:01.000Z"),
      },
    ]);
    await expect(deliveryPromise).rejects.toBeInstanceOf(ReceiptDeliveryError);
    await expect(deliveryPromise).rejects.toMatchObject({
      status: 409,
      retryable: false,
    });
  });
});
