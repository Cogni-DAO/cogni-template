// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `scheduler-worker/tests/fixtures/github-graphql.fixtures`
 * Purpose: Mock GitHub GraphQL API response fixtures for unit tests.
 * Scope: Test-only helpers for constructing mock repo-scoped GraphQL responses. Does not contain production logic or network I/O.
 * Side-effects: none
 * @internal
 */

export function makePrNode(overrides: {
  number: number;
  mergedAt: string;
  updatedAt?: string;
  title?: string;
  body?: string;
  baseRefName?: string;
  headRefName?: string;
  mergeCommitOid?: string;
  commitOids?: string[];
  labels?: string[];
  authorLogin?: string;
  authorDatabaseId?: number;
  authorTypename?: string;
  mergedById?: string;
  repo?: string;
}) {
  const repoFull = overrides.repo ?? "cogni-dao/cogni-template";
  return {
    number: overrides.number,
    title: overrides.title ?? `PR #${overrides.number}`,
    body: overrides.body ?? "",
    mergedAt: overrides.mergedAt,
    updatedAt: overrides.updatedAt ?? overrides.mergedAt,
    url: `https://github.com/${repoFull}/pull/${overrides.number}`,
    author: {
      __typename: overrides.authorTypename ?? "User",
      login: overrides.authorLogin ?? "testuser",
      databaseId: overrides.authorDatabaseId ?? 12345,
    },
    baseRefName: overrides.baseRefName ?? "staging",
    headRefName: overrides.headRefName ?? "feature/test",
    mergeCommit: {
      oid: overrides.mergeCommitOid ?? `merge-sha-${overrides.number}`,
    },
    mergedBy: { id: overrides.mergedById ?? "github-user-node-merger" },
    additions: 10,
    deletions: 5,
    changedFiles: 2,
    labels: { nodes: (overrides.labels ?? []).map((name) => ({ name })) },
    commits: {
      nodes: (overrides.commitOids ?? [`commit-sha-${overrides.number}`]).map(
        (oid) => ({ commit: { oid } })
      ),
    },
  };
}

export function makeReviewNode(overrides: {
  databaseId: number;
  submittedAt: string;
  state?: string;
  authorLogin?: string;
  authorDatabaseId?: number;
  authorTypename?: string;
}) {
  return {
    databaseId: overrides.databaseId,
    submittedAt: overrides.submittedAt,
    state: overrides.state ?? "APPROVED",
    author: {
      __typename: overrides.authorTypename ?? "User",
      login: overrides.authorLogin ?? "reviewer1",
      databaseId: overrides.authorDatabaseId ?? 67890,
    },
  };
}

export function makePrWithReviewsNode(overrides: {
  number: number;
  reviews: ReturnType<typeof makeReviewNode>[];
  baseRefName?: string;
  mergedAt?: string;
  updatedAt?: string;
  mergeCommitOid?: string;
  repo?: string;
}) {
  const repoFull = overrides.repo ?? "cogni-dao/cogni-template";
  return {
    number: overrides.number,
    url: `https://github.com/${repoFull}/pull/${overrides.number}`,
    baseRefName: overrides.baseRefName ?? "staging",
    mergedAt: overrides.mergedAt ?? "2026-01-02T00:00:00Z",
    updatedAt:
      overrides.updatedAt ?? overrides.mergedAt ?? "2026-01-02T00:00:00Z",
    mergeCommit: {
      oid: overrides.mergeCommitOid ?? `merge-sha-${overrides.number}`,
    },
    reviews: { nodes: overrides.reviews },
  };
}

export function makeIssueNode(overrides: {
  number: number;
  closedAt: string;
  updatedAt?: string;
  authorLogin?: string;
  authorDatabaseId?: number;
  authorTypename?: string;
  repo?: string;
}) {
  const repoFull = overrides.repo ?? "cogni-dao/cogni-template";
  return {
    number: overrides.number,
    title: `Issue #${overrides.number}`,
    closedAt: overrides.closedAt,
    updatedAt: overrides.updatedAt ?? overrides.closedAt,
    url: `https://github.com/${repoFull}/issues/${overrides.number}`,
    author: {
      __typename: overrides.authorTypename ?? "User",
      login: overrides.authorLogin ?? "issueauthor",
      databaseId: overrides.authorDatabaseId ?? 11111,
    },
  };
}

/**
 * Wraps nodes in repo-scoped connection response shape.
 * @param connectionKey - "pullRequests" or "issues"
 */
export function wrapRepoResponse<T>(
  connectionKey: "pullRequests" | "issues",
  nodes: T[],
  hasNextPage = false,
  endCursor: string | null = null
) {
  return {
    repository: {
      id: "github-repo-node-id",
      [connectionKey]: {
        pageInfo: { hasNextPage, endCursor },
        nodes,
      },
    },
  };
}

/**
 * Convenience: wrap PR/review nodes in pullRequests connection.
 */
export function wrapPrResponse<T>(
  nodes: T[],
  hasNextPage = false,
  endCursor: string | null = null
) {
  return wrapRepoResponse("pullRequests", nodes, hasNextPage, endCursor);
}

/**
 * Convenience: wrap issue nodes in issues connection.
 */
export function wrapIssueResponse<T>(
  nodes: T[],
  hasNextPage = false,
  endCursor: string | null = null
) {
  return wrapRepoResponse("issues", nodes, hasNextPage, endCursor);
}
