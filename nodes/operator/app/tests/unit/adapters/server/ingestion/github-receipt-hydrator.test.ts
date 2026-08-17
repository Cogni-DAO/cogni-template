// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/unit/adapters/server/ingestion/github-receipt-hydrator`
 * Purpose: Prove merged-PR commit hydration follows the production GraphQL cursor path beyond 250 commits.
 * Scope: Mocked GitHub App client only; no network or database.
 * Invariants: COMMIT_COLLECTION_LOSSLESS.
 * Side-effects: none
 * Links: task.5023
 * @internal
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { graphql } = vi.hoisted(() => ({ graphql: vi.fn() }));

vi.mock("@/adapters/server/review/github-auth", () => ({
  createInstallationOctokit: () => ({ graphql }),
}));

import { createGitHubMergedPrHydrator } from "@/adapters/server/ingestion/github-receipt-hydrator";

describe("createGitHubMergedPrHydrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns every commit including item 251", async () => {
    const commits = Array.from(
      { length: 251 },
      (_, index) => `commit-${String(index + 1).padStart(3, "0")}`
    );
    const cursors = [null, "cursor-100", "cursor-200"] as const;
    graphql.mockImplementation(
      (_query: string, variables: { cursor: string | null }) => {
        const pageIndex = cursors.indexOf(
          variables.cursor as (typeof cursors)[number]
        );
        const pageCommits = commits.slice(
          pageIndex * 100,
          (pageIndex + 1) * 100
        );
        return Promise.resolve({
          repository: {
            pullRequest: {
              commits: {
                pageInfo: {
                  hasNextPage: pageIndex < cursors.length - 1,
                  endCursor: cursors[pageIndex + 1] ?? null,
                },
                nodes: pageCommits.map((oid) => ({ commit: { oid } })),
              },
            },
          },
        });
      }
    );

    const hydrate = createGitHubMergedPrHydrator({
      appId: "1",
      privateKeyBase64: "unused-by-mock",
    });
    const result = await hydrate({
      installationId: 1,
      owner: "cogni-dao",
      repo: "node",
      prNumber: 42,
    });

    expect(result).toHaveLength(251);
    expect(result[250]).toBe("commit-251");
    expect(graphql.mock.calls.map(([, variables]) => variables.cursor)).toEqual(
      cursors
    );
  });
});
