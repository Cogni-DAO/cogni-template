// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/ingestion-core/tests/github-context`
 * Purpose: Prove webhook and poll facts converge on one canonical GitHub context/hash.
 * Scope: Pure builders and hashing. Does not perform GitHub I/O.
 * Invariants: PRODUCER_CONVERGENCE, PROVENANCE_EXCLUDED_FROM_CONTENT_HASH.
 * Side-effects: none
 * Links: task.5023
 * @internal
 */

import { describe, expect, it } from "vitest";
import {
  buildGitHubPrMergedContextV1,
  buildGitHubReviewContextV1,
} from "../src/github-context";
import { hashReceiptEconomicContent } from "../src/helpers";

describe("GitHub receipt producer convergence", () => {
  it("gives mutable webhook/poll snapshots the same economic hash", async () => {
    const commitShas = Array.from(
      { length: 251 },
      (_, index) => `commit-${index + 1}`
    );
    const facts = {
      providerRepoId: "github-repo-node-id",
      repo: "cogni-dao/node",
      prNumber: 42,
      title: "Human contribution",
      body: "Full body",
      baseBranch: "main",
      branch: "feat/human",
      mergeCommitSha: "merge-sha",
      mergedById: "github-user-node-merger",
      commitShas,
      labels: ["attribution"],
      additions: 20,
      deletions: 3,
      changedFiles: 4,
    } as const;

    // Both producers page the shared GraphQL cursor connection to exhaustion. The builder must
    // preserve the 251st commit byte-for-byte.
    const webhookContext = buildGitHubPrMergedContextV1(facts);
    const pollContext = buildGitHubPrMergedContextV1({
      ...facts,
      repo: "cogni-dao/renamed-node",
      title: "Edited after merge",
      body: "Edited body",
      branch: "renamed-branch",
      labels: ["later-label"],
    });
    expect(webhookContext).not.toEqual(pollContext);
    expect((pollContext.commitShas as string[])[250]).toBe("commit-251");

    const content = {
      receiptId: "github:pr:github-repo-node-id:42",
      source: "github" as const,
      eventType: "pr_merged" as const,
      platformUserId: "12345",
      artifactUrl: "https://github.com/cogni-dao/node/pull/42",
      eventTime: "2026-08-16T20:00:00.000Z",
    };
    const webhookHash = await hashReceiptEconomicContent({
      ...content,
      metadata: webhookContext,
    });
    const pollHash = await hashReceiptEconomicContent({
      ...content,
      metadata: pollContext,
    });
    expect(webhookHash).toBe(pollHash);
  });

  it("does not quarantine a review when later enrichment changes", async () => {
    const content = {
      receiptId: "github:review:github-repo-node-id:42:9001",
      source: "github" as const,
      eventType: "review_submitted" as const,
      platformUserId: "67890",
      artifactUrl:
        "https://github.com/cogni-dao/node/pull/42#pullrequestreview-9001",
      eventTime: "2026-08-16T19:00:00.000Z",
    };
    const webhook = buildGitHubReviewContextV1({
      providerRepoId: "github-repo-node-id",
      repo: "cogni-dao/node",
      prNumber: 42,
      reviewId: 9001,
      prBaseBranch: "main",
      prMergeCommitSha: null,
      state: "approved",
    });
    const laterPoll = buildGitHubReviewContextV1({
      providerRepoId: "github-repo-node-id",
      repo: "cogni-dao/renamed-node",
      prNumber: 42,
      reviewId: 9001,
      prBaseBranch: "release",
      prMergeCommitSha: "merge-sha-added-later",
      state: "dismissed",
    });

    await expect(
      hashReceiptEconomicContent({ ...content, metadata: webhook })
    ).resolves.toBe(
      await hashReceiptEconomicContent({ ...content, metadata: laterPoll })
    );
  });
});
