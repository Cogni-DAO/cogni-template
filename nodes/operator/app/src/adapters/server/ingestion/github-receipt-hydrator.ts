// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/ingestion/github-receipt-hydrator`
 * Purpose: Hydrate merged-PR webhook context with commit SHAs omitted by GitHub webhook payloads.
 * Scope: GitHub App read I/O only. Does not normalize or hash receipt content.
 * Invariants: AUTH_VIA_APP; all pages are read before the canonical receipt is minted.
 * Side-effects: IO (GitHub GraphQL)
 * Links: task.5023, github-webhook.ts
 * @internal
 */

import {
  GITHUB_PULL_REQUEST_COMMITS_QUERY,
  type GitHubPullRequestCommitsPage,
  parseGitHubPullRequestCommitsPage,
} from "@cogni/ingestion-core";

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
    let cursor: string | null = null;
    do {
      const response = await octokit.graphql<GitHubPullRequestCommitsPage>(
        GITHUB_PULL_REQUEST_COMMITS_QUERY,
        { owner, name: repo, number: prNumber, cursor }
      );
      const page = parseGitHubPullRequestCommitsPage(response);
      commitShas.push(...page.commitShas);
      cursor = page.nextCursor;
    } while (cursor !== null);
    return commitShas;
  };
}
