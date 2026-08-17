import type { CollectParams, VcsTokenProvider } from "@cogni/ingestion-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  type GitHubAdapterConfig,
  GitHubSourceAdapter,
} from "../src/adapters/ingestion/github";
import {
  makeIssueNode,
  makePrNode,
  makePrWithReviewsNode,
  makeReviewNode,
  wrapIssueResponse,
  wrapPrResponse,
} from "./fixtures/github-graphql.fixtures";

// ---------------------------------------------------------------------------
// Mock @octokit/core via the octokit-client module
// ---------------------------------------------------------------------------

const mockGraphqlFn = vi.fn();
const mockCommitGraphqlFn = vi.fn();

vi.mock("../src/adapters/ingestion/octokit-client", () => ({
  createGitHubClient: () => ({
    graphql: (query: string, variables: Record<string, unknown>) =>
      query.includes("CollectPullRequestCommits")
        ? mockCommitGraphqlFn(query, variables)
        : mockGraphqlFn(query, variables),
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Stub token provider that always returns a static token */
function stubTokenProvider(): VcsTokenProvider {
  return {
    getToken: vi.fn().mockResolvedValue({
      token: "ghs_test_token_1234",
      expiresAt: new Date(Date.now() + 3600_000),
    }),
  };
}

function makeAdapter(
  overrides?: Partial<GitHubAdapterConfig>
): GitHubSourceAdapter {
  return new GitHubSourceAdapter({
    tokenProvider: stubTokenProvider(),
    repos: ["cogni-dao/cogni-template"],
    ...overrides,
  });
}

const baseWindow = {
  since: new Date("2026-01-01T00:00:00Z"),
  until: new Date("2026-01-08T00:00:00Z"),
};

function makeCollectParams(overrides?: Partial<CollectParams>): CollectParams {
  return {
    streams: ["pull_requests"],
    cursor: null,
    window: baseWindow,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GitHubSourceAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCommitGraphqlFn.mockImplementation(
      (_query: string, variables: { number: number }) =>
        Promise.resolve({
          repository: {
            pullRequest: {
              commits: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [
                  { commit: { oid: `commit-sha-${variables.number}` } },
                ],
              },
            },
          },
        })
    );
  });

  describe("streams()", () => {
    it("returns three stream definitions", () => {
      const adapter = makeAdapter();
      const streams = adapter.streams();
      expect(streams).toHaveLength(3);
      expect(streams.map((s) => s.id)).toEqual([
        "pull_requests",
        "reviews",
        "issues",
      ]);
    });

    it("all streams use timestamp cursors", () => {
      const adapter = makeAdapter();
      for (const stream of adapter.streams()) {
        expect(stream.cursorType).toBe("timestamp");
      }
    });
  });

  describe("collect() — pull requests", () => {
    it("produces deterministic event IDs", async () => {
      const pr = makePrNode({
        number: 42,
        mergedAt: "2026-01-05T12:00:00Z",
      });
      mockGraphqlFn.mockResolvedValueOnce(wrapPrResponse([pr]));

      const adapter = makeAdapter();
      const result = await adapter.collect(makeCollectParams());

      expect(result.events).toHaveLength(1);
      expect(result.events[0]?.id).toBe("github:pr:github-repo-node-id:42");
    });

    it("produces deterministic payload hashes", async () => {
      const pr = makePrNode({
        number: 42,
        mergedAt: "2026-01-05T12:00:00Z",
        authorDatabaseId: 12345,
      });
      mockGraphqlFn.mockResolvedValueOnce(wrapPrResponse([pr]));
      const adapter1 = makeAdapter();
      const result1 = await adapter1.collect(makeCollectParams());

      mockGraphqlFn.mockResolvedValueOnce(wrapPrResponse([pr]));
      const adapter2 = makeAdapter();
      const result2 = await adapter2.collect(makeCollectParams());

      expect(result1.events[0]?.payloadHash).toBe(
        result2.events[0]?.payloadHash
      );
      expect(result1.events[0]?.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("uses numeric databaseId as platformUserId, not login", async () => {
      const pr = makePrNode({
        number: 1,
        mergedAt: "2026-01-02T00:00:00Z",
        authorLogin: "someuser",
        authorDatabaseId: 99999,
      });
      mockGraphqlFn.mockResolvedValueOnce(wrapPrResponse([pr]));

      const adapter = makeAdapter();
      const result = await adapter.collect(makeCollectParams());

      expect(result.events[0]?.platformUserId).toBe("99999");
      expect(result.events[0]?.platformLogin).toBe("someuser");
    });

    it("skips bot authors", async () => {
      const botPr = makePrNode({
        number: 10,
        mergedAt: "2026-01-03T00:00:00Z",
        authorTypename: "Bot",
        authorDatabaseId: undefined,
      });
      const userPr = makePrNode({
        number: 11,
        mergedAt: "2026-01-04T00:00:00Z",
      });
      mockGraphqlFn.mockResolvedValueOnce(wrapPrResponse([botPr, userPr]));

      const adapter = makeAdapter();
      const result = await adapter.collect(makeCollectParams());

      expect(result.events).toHaveLength(1);
      expect(result.events[0]?.id).toBe("github:pr:github-repo-node-id:11");
    });

    it("sets eventType to pr_merged", async () => {
      const pr = makePrNode({
        number: 1,
        mergedAt: "2026-01-02T00:00:00Z",
      });
      mockGraphqlFn.mockResolvedValueOnce(wrapPrResponse([pr]));

      const adapter = makeAdapter();
      const result = await adapter.collect(makeCollectParams());

      expect(result.events[0]?.eventType).toBe("pr_merged");
      expect(result.events[0]?.source).toBe("github");
      expect(result.events[0]?.metadata).toMatchObject({
        schemaVersion: 1,
        providerRepoId: "github-repo-node-id",
        repo: "cogni-dao/cogni-template",
        prNumber: 1,
        action: "closed",
        baseBranch: "staging",
        branch: "feature/test",
        mergedById: "github-user-node-merger",
        commitShas: ["commit-sha-1"],
      });
    });

    it("keeps ID and economic hash stable across a repository rename", async () => {
      const beforeRename = makePrNode({
        number: 42,
        mergedAt: "2026-01-05T12:00:00Z",
        repo: "cogni-dao/old-name",
      });
      const afterRename = makePrNode({
        number: 42,
        mergedAt: "2026-01-05T12:00:00Z",
        repo: "cogni-dao/new-name",
        title: "Edited after rename",
      });
      mockGraphqlFn
        .mockResolvedValueOnce(wrapPrResponse([beforeRename]))
        .mockResolvedValueOnce(wrapPrResponse([afterRename]));

      const first = await makeAdapter({
        repos: ["cogni-dao/old-name"],
      }).collect(makeCollectParams());
      const second = await makeAdapter({
        repos: ["cogni-dao/new-name"],
      }).collect(makeCollectParams());

      expect(first.events[0]?.id).toBe("github:pr:github-repo-node-id:42");
      expect(second.events[0]?.id).toBe(first.events[0]?.id);
      expect(second.events[0]?.payloadHash).toBe(first.events[0]?.payloadHash);
    });

    it("hydrates every merged-PR commit including item 251", async () => {
      const commits = Array.from(
        { length: 251 },
        (_, index) => `commit-${String(index + 1).padStart(3, "0")}`
      );
      const cursors = [null, "cursor-100", "cursor-200"] as const;
      mockCommitGraphqlFn.mockImplementation(
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
      mockGraphqlFn.mockResolvedValueOnce(
        wrapPrResponse([
          makePrNode({ number: 251, mergedAt: "2026-01-05T12:00:00Z" }),
        ])
      );

      const result = await makeAdapter().collect(makeCollectParams());
      const commitShas = result.events[0]?.metadata.commitShas as string[];
      expect(commitShas).toHaveLength(251);
      expect(commitShas[250]).toBe("commit-251");
      expect(
        mockCommitGraphqlFn.mock.calls.map(([, variables]) => variables.cursor)
      ).toEqual(cursors);
    });

    it("filters PRs outside the time window (client-side)", async () => {
      const inWindow = makePrNode({
        number: 1,
        mergedAt: "2026-01-05T00:00:00Z",
        updatedAt: "2026-01-05T00:00:00Z",
      });
      const beforeWindow = makePrNode({
        number: 2,
        mergedAt: "2025-12-15T00:00:00Z",
        updatedAt: "2026-01-02T00:00:00Z", // updated in window, but merged before
      });
      const afterWindow = makePrNode({
        number: 3,
        mergedAt: "2026-01-10T00:00:00Z",
        updatedAt: "2026-01-10T00:00:00Z",
      });
      mockGraphqlFn.mockResolvedValueOnce(
        wrapPrResponse([afterWindow, inWindow, beforeWindow])
      );

      const adapter = makeAdapter();
      const result = await adapter.collect(makeCollectParams());

      expect(result.events).toHaveLength(1);
      expect(result.events[0]?.id).toContain(":1");
    });

    it("early-stops when updatedAt falls before since", async () => {
      const recentPr = makePrNode({
        number: 1,
        mergedAt: "2026-01-05T00:00:00Z",
        updatedAt: "2026-01-05T00:00:00Z",
      });
      const oldPr = makePrNode({
        number: 2,
        mergedAt: "2025-06-01T00:00:00Z",
        updatedAt: "2025-06-01T00:00:00Z",
      });
      // Page 1: recent + old (old triggers early-stop)
      mockGraphqlFn.mockResolvedValueOnce(
        wrapPrResponse([recentPr, oldPr], true, "more-pages")
      );

      const adapter = makeAdapter();
      const result = await adapter.collect(makeCollectParams());

      expect(result.events).toHaveLength(1);
      // Should NOT make a second call — early-stop triggered
      expect(mockGraphqlFn).toHaveBeenCalledTimes(1);
    });
  });

  describe("collect() — cursor advancement", () => {
    it("advances cursor to latest eventTime", async () => {
      const pr1 = makePrNode({
        number: 1,
        mergedAt: "2026-01-02T00:00:00Z",
      });
      const pr2 = makePrNode({
        number: 2,
        mergedAt: "2026-01-05T00:00:00Z",
      });
      const pr3 = makePrNode({
        number: 3,
        mergedAt: "2026-01-03T00:00:00Z",
      });
      mockGraphqlFn.mockResolvedValueOnce(wrapPrResponse([pr1, pr2, pr3]));

      const adapter = makeAdapter();
      const result = await adapter.collect(makeCollectParams());

      expect(result.nextCursor.value).toBe("2026-01-05T00:00:00.000Z");
    });

    it("uses window.since when no events returned", async () => {
      mockGraphqlFn.mockResolvedValueOnce(wrapPrResponse([]));

      const adapter = makeAdapter();
      const result = await adapter.collect(makeCollectParams());

      expect(result.events).toHaveLength(0);
      expect(result.nextCursor.value).toBe(baseWindow.since.toISOString());
    });

    it("resumes from cursor value as exclusive lower bound", async () => {
      const pr = makePrNode({
        number: 5,
        mergedAt: "2026-01-06T00:00:00Z",
      });
      // PR merged exactly at cursor time should be excluded (exclusive lower bound)
      const prAtCursor = makePrNode({
        number: 4,
        mergedAt: "2026-01-04T00:00:00Z",
      });
      mockGraphqlFn.mockResolvedValueOnce(wrapPrResponse([pr, prAtCursor]));

      const adapter = makeAdapter();
      const result = await adapter.collect(
        makeCollectParams({
          cursor: {
            streamId: "pull_requests",
            value: "2026-01-04T00:00:00Z",
            retrievedAt: new Date(),
          },
        })
      );

      // prAtCursor should be excluded (mergedAt <= since)
      expect(result.events).toHaveLength(1);
      expect(result.events[0]?.id).toContain(":5");
    });
  });

  describe("collect() — pagination", () => {
    it("follows pagination when hasNextPage is true", async () => {
      const page1Pr = makePrNode({
        number: 1,
        mergedAt: "2026-01-05T00:00:00Z",
        updatedAt: "2026-01-05T00:00:00Z",
      });
      const page2Pr = makePrNode({
        number: 2,
        mergedAt: "2026-01-03T00:00:00Z",
        updatedAt: "2026-01-03T00:00:00Z",
      });

      mockGraphqlFn
        .mockResolvedValueOnce(wrapPrResponse([page1Pr], true, "cursor-page-1"))
        .mockResolvedValueOnce(wrapPrResponse([page2Pr], false, null));

      const adapter = makeAdapter();
      const result = await adapter.collect(makeCollectParams());

      expect(result.events).toHaveLength(2);
      expect(mockGraphqlFn).toHaveBeenCalledTimes(2);
    });

    it("respects maxEventsPerCall limit", async () => {
      const prs = Array.from({ length: 5 }, (_, i) =>
        makePrNode({
          number: i + 1,
          mergedAt: `2026-01-0${i + 2}T00:00:00Z`,
        })
      );
      mockGraphqlFn.mockResolvedValueOnce(
        wrapPrResponse(prs, true, "more-pages")
      );

      const adapter = makeAdapter({ maxEventsPerCall: 3 });
      const result = await adapter.collect(makeCollectParams());

      expect(result.events).toHaveLength(3);
      // Should NOT make a second call since limit was reached
      expect(mockGraphqlFn).toHaveBeenCalledTimes(1);
    });
  });

  describe("collect() — reviews", () => {
    it("collects reviews with deterministic IDs", async () => {
      const review = makeReviewNode({
        databaseId: 555,
        submittedAt: "2026-01-03T10:00:00Z",
      });
      const prWithReviews = makePrWithReviewsNode({
        number: 42,
        mergedAt: "2026-01-02T00:00:00Z",
        updatedAt: "2026-01-03T10:00:00Z",
        reviews: [review],
      });
      mockGraphqlFn.mockResolvedValueOnce(wrapPrResponse([prWithReviews]));

      const adapter = makeAdapter();
      const result = await adapter.collect(
        makeCollectParams({ streams: ["reviews"] })
      );

      expect(result.events).toHaveLength(1);
      expect(result.events[0]?.id).toBe(
        "github:review:github-repo-node-id:42:555"
      );
      expect(result.events[0]?.eventType).toBe("review_submitted");
      expect(result.events[0]?.metadata).toMatchObject({
        schemaVersion: 1,
        providerRepoId: "github-repo-node-id",
        repo: "cogni-dao/cogni-template",
        prNumber: 42,
        prBaseBranch: "staging",
        prMergeCommitSha: "merge-sha-42",
      });
    });

    it("filters reviews outside the time window", async () => {
      const inWindow = makeReviewNode({
        databaseId: 1,
        submittedAt: "2026-01-03T00:00:00Z",
      });
      const beforeWindow = makeReviewNode({
        databaseId: 2,
        submittedAt: "2025-12-01T00:00:00Z",
      });
      const afterWindow = makeReviewNode({
        databaseId: 3,
        submittedAt: "2026-02-01T00:00:00Z",
      });
      const pr = makePrWithReviewsNode({
        number: 10,
        updatedAt: "2026-02-01T00:00:00Z",
        reviews: [inWindow, beforeWindow, afterWindow],
      });
      mockGraphqlFn.mockResolvedValueOnce(wrapPrResponse([pr]));

      const adapter = makeAdapter();
      const result = await adapter.collect(
        makeCollectParams({ streams: ["reviews"] })
      );

      expect(result.events).toHaveLength(1);
      expect(result.events[0]?.id).toContain(":1"); // only inWindow review
    });

    it("skips bot review authors", async () => {
      const botReview = makeReviewNode({
        databaseId: 100,
        submittedAt: "2026-01-03T00:00:00Z",
        authorTypename: "Bot",
        authorDatabaseId: undefined,
      });
      const pr = makePrWithReviewsNode({
        number: 20,
        updatedAt: "2026-01-03T00:00:00Z",
        reviews: [botReview],
      });
      mockGraphqlFn.mockResolvedValueOnce(wrapPrResponse([pr]));

      const adapter = makeAdapter();
      const result = await adapter.collect(
        makeCollectParams({ streams: ["reviews"] })
      );

      expect(result.events).toHaveLength(0);
    });
  });

  describe("collect() — issues", () => {
    it("collects closed issues with deterministic IDs", async () => {
      const issue = makeIssueNode({
        number: 99,
        closedAt: "2026-01-04T15:00:00Z",
      });
      mockGraphqlFn.mockResolvedValueOnce(wrapIssueResponse([issue]));

      const adapter = makeAdapter();
      const result = await adapter.collect(
        makeCollectParams({ streams: ["issues"] })
      );

      expect(result.events).toHaveLength(1);
      expect(result.events[0]?.id).toBe("github:issue:github-repo-node-id:99");
      expect(result.events[0]?.eventType).toBe("issue_closed");
      expect(result.events[0]?.metadata).toMatchObject({
        schemaVersion: 1,
        providerRepoId: "github-repo-node-id",
        repo: "cogni-dao/cogni-template",
        issueNumber: 99,
        action: "closed",
      });
    });
  });

  describe("collect() — tokenProvider integration", () => {
    it("calls tokenProvider on first collect()", async () => {
      const mockTokenProvider = stubTokenProvider();

      const pr = makePrNode({
        number: 1,
        mergedAt: "2026-01-02T00:00:00Z",
      });
      mockGraphqlFn.mockResolvedValueOnce(wrapPrResponse([pr]));

      const adapter = new GitHubSourceAdapter({
        tokenProvider: mockTokenProvider,
        repos: ["cogni-dao/cogni-template"],
      });

      const result = await adapter.collect(makeCollectParams());

      expect(result.events).toHaveLength(1);
      expect(mockTokenProvider.getToken).toHaveBeenCalledWith({
        provider: "github",
        capability: "ingest",
        repoRef: "cogni-dao/cogni-template",
      });
    });

    it("refreshes token when near expiry", async () => {
      const mockTokenProvider: VcsTokenProvider = {
        getToken: vi
          .fn()
          // First call: token that expires soon
          .mockResolvedValueOnce({
            token: "ghs_first",
            expiresAt: new Date(Date.now() + 60_000), // 1 min — within 5-min buffer
          })
          // Second call: fresh token
          .mockResolvedValueOnce({
            token: "ghs_second",
            expiresAt: new Date(Date.now() + 3600_000),
          }),
      };

      const pr = makePrNode({ number: 1, mergedAt: "2026-01-02T00:00:00Z" });
      mockGraphqlFn
        .mockResolvedValueOnce(wrapPrResponse([pr]))
        .mockResolvedValueOnce(wrapPrResponse([]));

      const adapter = new GitHubSourceAdapter({
        tokenProvider: mockTokenProvider,
        repos: ["cogni-dao/cogni-template"],
      });

      // First collect — gets first token
      await adapter.collect(makeCollectParams());
      // Second collect — token near expiry, should refresh
      await adapter.collect(makeCollectParams());

      expect(mockTokenProvider.getToken).toHaveBeenCalledTimes(2);
    });
  });

  describe("collect() — multiple streams", () => {
    it("collects from multiple streams in one call", async () => {
      const pr = makePrNode({
        number: 1,
        mergedAt: "2026-01-02T00:00:00Z",
      });
      const review = makeReviewNode({
        databaseId: 100,
        submittedAt: "2026-01-03T00:00:00Z",
      });
      const prWithReviews = makePrWithReviewsNode({
        number: 1,
        updatedAt: "2026-01-03T00:00:00Z",
        reviews: [review],
      });
      const issue = makeIssueNode({
        number: 50,
        closedAt: "2026-01-04T00:00:00Z",
      });

      mockGraphqlFn
        .mockResolvedValueOnce(wrapPrResponse([pr])) // PRs
        .mockResolvedValueOnce(wrapPrResponse([prWithReviews])) // Reviews
        .mockResolvedValueOnce(wrapIssueResponse([issue])); // Issues

      const adapter = makeAdapter();
      const result = await adapter.collect(
        makeCollectParams({
          streams: ["pull_requests", "reviews", "issues"],
        })
      );

      expect(result.events).toHaveLength(3);
      expect(result.events.map((e) => e.eventType)).toEqual([
        "pr_merged",
        "review_submitted",
        "issue_closed",
      ]);
    });
  });
});
