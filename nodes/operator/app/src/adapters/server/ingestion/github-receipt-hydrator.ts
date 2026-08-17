// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/ingestion/github-receipt-hydrator`
 * Purpose: Hydrate merged-PR webhook context with commit SHAs omitted by GitHub webhook payloads.
 * Scope: GitHub App read I/O only. Does not normalize or hash receipt content.
 * Invariants: AUTH_VIA_APP; all pages are read before the canonical receipt is minted.
 * Side-effects: IO (GitHub REST)
 * Links: task.5023, github-webhook.ts
 * @internal
 */

import { createInstallationOctokit } from "../review/github-auth";
import type { GitHubMergedPrHydrator } from "./github-webhook";

export function createGitHubMergedPrHydrator(input: {
  readonly appId: string;
  readonly privateKeyBase64: string;
}): GitHubMergedPrHydrator {
  return async ({ installationId, owner, repo, prNumber }) => {
    const octokit = createInstallationOctokit(
      installationId,
      input.appId,
      input.privateKeyBase64
    );
    const commitShas: string[] = [];
    for (let page = 1; ; page += 1) {
      const response = await octokit.request(
        "GET /repos/{owner}/{repo}/pulls/{pull_number}/commits",
        { owner, repo, pull_number: prNumber, per_page: 100, page }
      );
      const commits = response.data as ReadonlyArray<{ sha: string }>;
      commitShas.push(...commits.map((commit) => commit.sha));
      if (commits.length < 100) break;
    }
    return commitShas;
  };
}
