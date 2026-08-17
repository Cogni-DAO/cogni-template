// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/ingestion-core/github-commit-pagination`
 * Purpose: Shared GraphQL contract and pure page parser for lossless pull-request commit collection.
 * Scope: Query text, response types, and cursor parsing only. Does not execute GitHub I/O.
 * Invariants: COMMIT_COLLECTION_LOSSLESS; a continued connection must provide an end cursor.
 * Side-effects: none
 * Links: task.5023, docs/spec/attribution-ledger.md
 * @public
 */

/** GitHub's cursor-paginated PR commit connection has no REST 250-item cap. */
export const GITHUB_PULL_REQUEST_COMMITS_QUERY = /* GraphQL */ `
  query CollectPullRequestCommits(
    $owner: String!
    $name: String!
    $number: Int!
    $cursor: String
  ) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) {
        commits(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes { commit { oid } }
        }
      }
    }
  }
`;

export interface GitHubPullRequestCommitsPage {
  readonly repository: {
    readonly pullRequest: {
      readonly commits: {
        readonly pageInfo: {
          readonly hasNextPage: boolean;
          readonly endCursor: string | null;
        };
        readonly nodes: ReadonlyArray<{
          readonly commit: { readonly oid: string };
        }>;
      };
    } | null;
  } | null;
}

export interface ParsedGitHubPullRequestCommitsPage {
  readonly commitShas: readonly string[];
  readonly nextCursor: string | null;
}

/** Parse one page and fail loud rather than silently truncate a malformed cursor chain. */
export function parseGitHubPullRequestCommitsPage(
  page: GitHubPullRequestCommitsPage
): ParsedGitHubPullRequestCommitsPage {
  const connection = page.repository?.pullRequest?.commits;
  if (!connection) {
    throw new Error("GitHub pull request commit connection was not found");
  }
  const nextCursor = connection.pageInfo.hasNextPage
    ? connection.pageInfo.endCursor
    : null;
  if (connection.pageInfo.hasNextPage && nextCursor === null) {
    throw new Error(
      "GitHub pull request commit connection has another page but no end cursor"
    );
  }
  return {
    commitShas: connection.nodes.map((node) => node.commit.oid),
    nextCursor,
  };
}
