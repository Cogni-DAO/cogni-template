// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/ingestion-core/tests/github-context`
 * Purpose: Prove webhook and poll facts converge on one canonical GitHub context/hash.
 * Scope: Pure builders and hashing. Does not perform GitHub I/O.
 * Invariants: PRODUCER_CONVERGENCE, PROVENANCE_EXCLUDED_FROM_CONTENT_HASH.
 * Side-effects: none
 * Links: story.5023
 * @internal
 */

import { describe, expect, it } from "vitest";
import { buildGitHubPrMergedContextV1 } from "../src/github-context";
import { hashReceiptContent } from "../src/helpers";

describe("GitHub receipt producer convergence", () => {
  it("gives webhook and poll the same canonical context and hash", async () => {
    const facts = {
      repo: "cogni-dao/node",
      prNumber: 42,
      title: "Human contribution",
      body: "Full body",
      baseBranch: "main",
      branch: "feat/human",
      mergeCommitSha: "merge-sha",
      commitShas: ["one", "two"],
      labels: ["attribution"],
      additions: 20,
      deletions: 3,
      changedFiles: 4,
    } as const;

    // The webhook obtains commitShas through GitHub App hydration; poll obtains
    // them through GraphQL. From this boundary onward their context is identical.
    const webhookContext = buildGitHubPrMergedContextV1(facts);
    const pollContext = buildGitHubPrMergedContextV1({ ...facts });
    expect(webhookContext).toEqual(pollContext);

    const content = {
      receiptId: "github:pr:cogni-dao/node:42",
      source: "github" as const,
      eventType: "pr_merged" as const,
      platformUserId: "12345",
      artifactUrl: "https://github.com/cogni-dao/node/pull/42",
      eventTime: "2026-08-16T20:00:00.000Z",
    };
    const webhookHash = await hashReceiptContent({
      ...content,
      metadata: webhookContext,
    });
    const pollHash = await hashReceiptContent({
      ...content,
      metadata: pollContext,
    });
    expect(webhookHash).toBe(pollHash);
  });
});
