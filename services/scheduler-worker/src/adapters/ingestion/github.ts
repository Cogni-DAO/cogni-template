// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `scheduler-worker/adapters/ingestion/github`
 * Purpose: GitHub source adapter — collects merged PRs, submitted reviews, and closed issues via GraphQL.
 * Scope: Implements PollAdapter from @cogni/ingestion-core. Lives in scheduler-worker per ADAPTERS_NOT_IN_CORE.
 * Invariants:
 * - ACTIVITY_IDEMPOTENT: Deterministic event IDs from source data.
 * - PROVENANCE_REQUIRED: payloadHash (SHA-256), producer, version on every event.
 * - Uses repo-scoped GraphQL connections (authoritative), NOT search() (best-effort index).
 * - Client-side time-window filtering with updatedAt early-stop optimization.
 * - PR metadata includes baseBranch, mergeCommitSha, and commitShas for production-promotion selection.
 * - Review metadata includes prBaseBranch and prMergeCommitSha for cross-referencing.
 * - platformUserId = GitHub numeric databaseId (stable), not login (mutable).
 * - Bot authors skipped (no databaseId on Bot/Mannequin actors).
 * - Rate limiting handled by @octokit/plugin-retry + @octokit/plugin-throttling.
 * Side-effects: HTTP (GitHub GraphQL API)
 * Links: docs/spec/attribution-ledger.md, docs/research/epoch-event-ingestion-pipeline.md
 * @internal
 */

import type {
  ActivityEvent,
  CollectParams,
  CollectResult,
  PollAdapter,
  StreamDefinition,
  VcsTokenProvider,
} from "@cogni/ingestion-core";
import {
  buildEventId,
  buildGitHubIssueContextV1,
  buildGitHubPrMergedContextV1,
  buildGitHubReviewContextV1,
  GITHUB_ADAPTER_VERSION,
  hashReceiptEconomicContent,
} from "@cogni/ingestion-core";

import type { GitHubClient } from "./octokit-client.js";
import { createGitHubClient } from "./octokit-client.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface GitHubAdapterConfig {
  /** Token provider (GitHub App auth) */
  readonly tokenProvider: VcsTokenProvider;
  /** Repos to collect from, format: "owner/repo" */
  readonly repos: readonly string[];
  /** Max events to return per collect() call (default: 500) */
  readonly maxEventsPerCall?: number;
}

// ---------------------------------------------------------------------------
// Internal GraphQL response types
// ---------------------------------------------------------------------------

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface GitHubActor {
  __typename: string;
  login: string;
  databaseId?: number; // Only on User, not Bot/Mannequin
}

interface PrCommitNode {
  commit: { oid: string };
}

interface PrNode {
  number: number;
  title: string;
  body: string;
  mergedAt: string;
  updatedAt: string;
  url: string;
  author: GitHubActor | null;
  baseRefName: string;
  headRefName: string;
  mergeCommit: { oid: string } | null;
  mergedBy: { id: string } | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  labels: { nodes: Array<{ name: string }> };
  commits: { nodes: PrCommitNode[] };
}

interface ReviewNode {
  databaseId: number;
  submittedAt: string;
  state: string;
  author: GitHubActor | null;
}

interface PrWithReviewsNode {
  number: number;
  url: string;
  baseRefName: string;
  mergedAt: string;
  updatedAt: string;
  mergeCommit: { oid: string } | null;
  reviews: { nodes: ReviewNode[] };
}

interface IssueNode {
  number: number;
  title: string;
  closedAt: string;
  updatedAt: string;
  url: string;
  author: GitHubActor | null;
}

interface RepoConnectionResponse<T> {
  repository: {
    id: string;
    pullRequests?: { pageInfo: PageInfo; nodes: T[] };
    issues?: { pageInfo: PageInfo; nodes: T[] };
  };
}

// ---------------------------------------------------------------------------
// Logger interface (minimal — adapters shouldn't depend on pino directly)
// ---------------------------------------------------------------------------

interface LoggerLike {
  debug(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
}

const silentLogger: LoggerLike = {
  debug() {},
  warn() {},
};

// ---------------------------------------------------------------------------
// GraphQL queries — repo-scoped connections (authoritative, not search index)
// ---------------------------------------------------------------------------

const MERGED_PRS_QUERY = /* GraphQL */ `
  query CollectMergedPRs($owner: String!, $name: String!, $cursor: String) {
    repository(owner: $owner, name: $name) {
      id
      pullRequests(first: 100, after: $cursor, states: MERGED, orderBy: { field: UPDATED_AT, direction: DESC }) {
        pageInfo { hasNextPage endCursor }
        nodes {
          number
          title
          body
          mergedAt
          updatedAt
          url
          author { __typename login ... on User { databaseId } }
          baseRefName
          headRefName
          mergeCommit { oid }
          mergedBy { id }
          additions
          deletions
          changedFiles
          labels(first: 20) { nodes { name } }
          commits(first: 250) { nodes { commit { oid } } }
        }
      }
    }
  }
`;

const REVIEWS_QUERY = /* GraphQL */ `
  query CollectReviews($owner: String!, $name: String!, $cursor: String) {
    repository(owner: $owner, name: $name) {
      id
      pullRequests(first: 100, after: $cursor, states: MERGED, orderBy: { field: UPDATED_AT, direction: DESC }) {
        pageInfo { hasNextPage endCursor }
        nodes {
          number
          url
          baseRefName
          mergedAt
          updatedAt
          mergeCommit { oid }
          reviews(first: 100) {
            nodes {
              databaseId
              submittedAt
              state
              author { __typename login ... on User { databaseId } }
            }
          }
        }
      }
    }
  }
`;

const CLOSED_ISSUES_QUERY = /* GraphQL */ `
  query CollectClosedIssues($owner: String!, $name: String!, $cursor: String) {
    repository(owner: $owner, name: $name) {
      id
      issues(first: 100, after: $cursor, states: CLOSED, orderBy: { field: UPDATED_AT, direction: DESC }) {
        pageInfo { hasNextPage endCursor }
        nodes {
          number
          title
          closedAt
          updatedAt
          url
          author { __typename login ... on User { databaseId } }
        }
      }
    }
  }
`;

/** Buffer before token expiry to trigger refresh (5 minutes) */
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class GitHubSourceAdapter implements PollAdapter {
  readonly source = "github" as const;
  readonly version = GITHUB_ADAPTER_VERSION;

  private readonly tokenProvider: VcsTokenProvider;
  private readonly repos: readonly string[];
  private readonly maxEventsPerCall: number;
  private readonly logger: LoggerLike;

  private octokit: GitHubClient | undefined;
  private tokenExpiresAt: Date | undefined;

  constructor(config: GitHubAdapterConfig, logger?: LoggerLike) {
    this.repos = config.repos;
    this.maxEventsPerCall = config.maxEventsPerCall ?? 500;
    this.logger = logger ?? silentLogger;
    this.tokenProvider = config.tokenProvider;
  }

  streams(): StreamDefinition[] {
    return [
      {
        id: "pull_requests",
        name: "Pull Requests (merged)",
        cursorType: "timestamp",
        defaultPollInterval: 3600,
      },
      {
        id: "reviews",
        name: "PR Reviews submitted",
        cursorType: "timestamp",
        defaultPollInterval: 3600,
      },
      {
        id: "issues",
        name: "Issues closed",
        cursorType: "timestamp",
        defaultPollInterval: 3600,
      },
    ];
  }

  async collect(params: CollectParams): Promise<CollectResult> {
    const { streams, cursor, window } = params;
    const since = cursor ? new Date(cursor.value) : window.since;
    const until = window.until;
    const allEvents: ActivityEvent[] = [];
    let latestTime = since;

    for (const repo of this.repos) {
      if (allEvents.length >= this.maxEventsPerCall) break;

      const [owner, repoName] = repo.split("/");
      if (!owner || !repoName) {
        this.logger.warn(`Invalid repo format, expected owner/repo: ${repo}`);
        continue;
      }

      for (const streamId of streams) {
        if (allEvents.length >= this.maxEventsPerCall) break;

        const remaining = this.maxEventsPerCall - allEvents.length;
        const events = await this.collectStream(
          streamId,
          owner,
          repoName,
          since,
          until,
          remaining
        );

        for (const event of events) {
          allEvents.push(event);
          if (event.eventTime > latestTime) {
            latestTime = event.eventTime;
          }
        }
      }
    }

    return {
      events: allEvents,
      nextCursor: {
        streamId: streams[0] ?? "pull_requests",
        value: latestTime.toISOString(),
        retrievedAt: new Date(),
      },
    };
  }

  // -------------------------------------------------------------------------
  // Private: client management with token refresh
  // -------------------------------------------------------------------------

  private async getClient(): Promise<GitHubClient> {
    const needsRefresh =
      !this.octokit ||
      !this.tokenExpiresAt ||
      Date.now() >= this.tokenExpiresAt.getTime() - TOKEN_REFRESH_BUFFER_MS;

    if (needsRefresh) {
      const { token, expiresAt } = await this.tokenProvider.getToken({
        provider: "github",
        capability: "ingest",
        repoRef: this.repos[0],
      });
      const client = createGitHubClient(token);
      this.octokit = client;
      this.tokenExpiresAt = expiresAt;
      return client;
    }

    // Safe: needsRefresh is true when this.octokit is undefined
    return this.octokit as GitHubClient;
  }

  // -------------------------------------------------------------------------
  // Private: stream dispatch
  // -------------------------------------------------------------------------

  private async collectStream(
    streamId: string,
    owner: string,
    repoName: string,
    since: Date,
    until: Date,
    limit: number
  ): Promise<ActivityEvent[]> {
    switch (streamId) {
      case "pull_requests":
        return this.collectPullRequests(owner, repoName, since, until, limit);
      case "reviews":
        return this.collectReviews(owner, repoName, since, until, limit);
      case "issues":
        return this.collectIssues(owner, repoName, since, until, limit);
      default:
        this.logger.warn(`Unknown stream: ${streamId}`);
        return [];
    }
  }

  // -------------------------------------------------------------------------
  // Private: Pull Requests (merged)
  // Uses repository.pullRequests (authoritative) with client-side window filter.
  // Ordered by UPDATED_AT DESC — early-stop when updatedAt < since.
  // -------------------------------------------------------------------------

  private async collectPullRequests(
    owner: string,
    repoName: string,
    since: Date,
    until: Date,
    limit: number
  ): Promise<ActivityEvent[]> {
    const events: ActivityEvent[] = [];
    let pageCursor: string | null = null;
    let reachedEarlyStop = false;

    do {
      const response: RepoConnectionResponse<PrNode> = await this.executeQuery<
        RepoConnectionResponse<PrNode>
      >(MERGED_PRS_QUERY, { owner, name: repoName, cursor: pageCursor });

      const connection: RepoConnectionResponse<PrNode>["repository"]["pullRequests"] =
        response.repository.pullRequests;
      if (!connection) break;

      for (const pr of connection.nodes) {
        if (events.length >= limit) break;

        // Early-stop: ordered by updatedAt DESC, so once updatedAt < since
        // no subsequent PRs can have mergedAt in our window
        if (new Date(pr.updatedAt) < since) {
          reachedEarlyStop = true;
          break;
        }

        // Client-side time-window filter on mergedAt
        const mergedAt = new Date(pr.mergedAt);
        if (mergedAt <= since || mergedAt > until) continue;

        const event = await this.normalizePr(
          owner,
          repoName,
          response.repository.id,
          pr
        );
        if (event) events.push(event);
      }

      pageCursor =
        !reachedEarlyStop && connection.pageInfo.hasNextPage
          ? connection.pageInfo.endCursor
          : null;
    } while (pageCursor && events.length < limit);

    return events;
  }

  private async normalizePr(
    owner: string,
    repoName: string,
    providerRepoId: string,
    pr: PrNode
  ): Promise<ActivityEvent | null> {
    if (
      !pr.author ||
      pr.author.__typename !== "User" ||
      !pr.author.databaseId
    ) {
      this.logger.debug(
        `Skipping PR #${pr.number} in ${owner}/${repoName}: author is ${pr.author?.__typename ?? "null"}`
      );
      return null;
    }

    if (
      !pr.mergedBy?.id ||
      !pr.mergeCommit?.oid ||
      pr.commits.nodes.length === 0
    ) {
      throw new Error(
        `Merged PR #${pr.number} in ${owner}/${repoName} is missing immutable merge identity`
      );
    }
    const id = buildEventId("github", "pr", `${owner}/${repoName}`, pr.number);
    const authorId = String(pr.author.databaseId);
    const eventTime = new Date(pr.mergedAt);
    const metadata = buildGitHubPrMergedContextV1({
      providerRepoId,
      repo: `${owner}/${repoName}`,
      prNumber: pr.number,
      title: pr.title,
      body: pr.body,
      baseBranch: pr.baseRefName,
      branch: pr.headRefName,
      mergeCommitSha: pr.mergeCommit.oid,
      mergedById: pr.mergedBy.id,
      commitShas: pr.commits.nodes.map((c) => c.commit.oid),
      labels: pr.labels.nodes.map((l) => l.name),
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changedFiles,
    });
    const payloadHash = await hashReceiptEconomicContent({
      receiptId: id,
      source: "github",
      eventType: "pr_merged",
      platformUserId: authorId,
      artifactUrl: pr.url,
      metadata,
      eventTime,
    });

    return {
      id,
      source: "github",
      eventType: "pr_merged",
      platformUserId: authorId,
      platformLogin: pr.author.login,
      artifactUrl: pr.url,
      metadata,
      payloadHash,
      eventTime,
    };
  }

  // -------------------------------------------------------------------------
  // Private: Reviews
  // Pages merged PRs by updatedAt DESC, then filters reviews by submittedAt.
  // Early-stop when updatedAt < since.
  // -------------------------------------------------------------------------

  private async collectReviews(
    owner: string,
    repoName: string,
    since: Date,
    until: Date,
    limit: number
  ): Promise<ActivityEvent[]> {
    const events: ActivityEvent[] = [];
    let pageCursor: string | null = null;
    let reachedEarlyStop = false;

    do {
      const response: RepoConnectionResponse<PrWithReviewsNode> =
        await this.executeQuery<RepoConnectionResponse<PrWithReviewsNode>>(
          REVIEWS_QUERY,
          { owner, name: repoName, cursor: pageCursor }
        );

      const connection: RepoConnectionResponse<PrWithReviewsNode>["repository"]["pullRequests"] =
        response.repository.pullRequests;
      if (!connection) break;

      for (const pr of connection.nodes) {
        if (events.length >= limit) break;

        // Early-stop: no subsequent PRs can have reviews in our window
        if (new Date(pr.updatedAt) < since) {
          reachedEarlyStop = true;
          break;
        }

        if (!pr.reviews) continue;

        for (const review of pr.reviews.nodes) {
          if (events.length >= limit) break;

          // Client-side time-window filter on submittedAt
          const submittedAt = new Date(review.submittedAt);
          if (submittedAt <= since || submittedAt > until) continue;

          const event = await this.normalizeReview(
            owner,
            repoName,
            response.repository.id,
            pr.number,
            review,
            pr.baseRefName,
            pr.mergeCommit?.oid ?? null
          );
          if (event) events.push(event);
        }
      }

      pageCursor =
        !reachedEarlyStop && connection.pageInfo.hasNextPage
          ? connection.pageInfo.endCursor
          : null;
    } while (pageCursor && events.length < limit);

    return events;
  }

  private async normalizeReview(
    owner: string,
    repoName: string,
    providerRepoId: string,
    prNumber: number,
    review: ReviewNode,
    prBaseBranch: string,
    prMergeCommitSha: string | null
  ): Promise<ActivityEvent | null> {
    if (
      !review.author ||
      review.author.__typename !== "User" ||
      !review.author.databaseId
    ) {
      this.logger.debug(
        `Skipping review ${review.databaseId} on PR #${prNumber} in ${owner}/${repoName}: author is ${review.author?.__typename ?? "null"}`
      );
      return null;
    }

    const id = buildEventId(
      "github",
      "review",
      `${owner}/${repoName}`,
      prNumber,
      review.databaseId
    );
    const authorId = String(review.author.databaseId);
    const eventTime = new Date(review.submittedAt);
    const artifactUrl = `https://github.com/${owner}/${repoName}/pull/${prNumber}#pullrequestreview-${review.databaseId}`;
    const metadata = buildGitHubReviewContextV1({
      providerRepoId,
      repo: `${owner}/${repoName}`,
      prNumber,
      prBaseBranch,
      prMergeCommitSha,
      state: review.state,
    });
    const payloadHash = await hashReceiptEconomicContent({
      receiptId: id,
      source: "github",
      eventType: "review_submitted",
      platformUserId: authorId,
      artifactUrl,
      metadata,
      eventTime,
    });

    return {
      id,
      source: "github",
      eventType: "review_submitted",
      platformUserId: authorId,
      platformLogin: review.author.login,
      artifactUrl,
      metadata,
      payloadHash,
      eventTime,
    };
  }

  // -------------------------------------------------------------------------
  // Private: Issues (closed)
  // Uses repository.issues (authoritative) with client-side window filter.
  // Ordered by UPDATED_AT DESC — early-stop when updatedAt < since.
  // -------------------------------------------------------------------------

  private async collectIssues(
    owner: string,
    repoName: string,
    since: Date,
    until: Date,
    limit: number
  ): Promise<ActivityEvent[]> {
    const events: ActivityEvent[] = [];
    let pageCursor: string | null = null;
    let reachedEarlyStop = false;

    do {
      const response: RepoConnectionResponse<IssueNode> =
        await this.executeQuery<RepoConnectionResponse<IssueNode>>(
          CLOSED_ISSUES_QUERY,
          { owner, name: repoName, cursor: pageCursor }
        );

      const connection: RepoConnectionResponse<IssueNode>["repository"]["issues"] =
        response.repository.issues;
      if (!connection) break;

      for (const issue of connection.nodes) {
        if (events.length >= limit) break;

        // Early-stop: no subsequent issues can have closedAt in our window
        if (new Date(issue.updatedAt) < since) {
          reachedEarlyStop = true;
          break;
        }

        // Client-side time-window filter on closedAt
        const closedAt = new Date(issue.closedAt);
        if (closedAt <= since || closedAt > until) continue;

        const event = await this.normalizeIssue(
          owner,
          repoName,
          response.repository.id,
          issue
        );
        if (event) events.push(event);
      }

      pageCursor =
        !reachedEarlyStop && connection.pageInfo.hasNextPage
          ? connection.pageInfo.endCursor
          : null;
    } while (pageCursor && events.length < limit);

    return events;
  }

  private async normalizeIssue(
    owner: string,
    repoName: string,
    providerRepoId: string,
    issue: IssueNode
  ): Promise<ActivityEvent | null> {
    if (
      !issue.author ||
      issue.author.__typename !== "User" ||
      !issue.author.databaseId
    ) {
      this.logger.debug(
        `Skipping issue #${issue.number} in ${owner}/${repoName}: author is ${issue.author?.__typename ?? "null"}`
      );
      return null;
    }

    const id = buildEventId(
      "github",
      "issue",
      `${owner}/${repoName}`,
      issue.number
    );
    const authorId = String(issue.author.databaseId);
    const eventTime = new Date(issue.closedAt);
    const metadata = buildGitHubIssueContextV1({
      providerRepoId,
      repo: `${owner}/${repoName}`,
      issueNumber: issue.number,
      title: issue.title,
      action: "closed",
    });
    const payloadHash = await hashReceiptEconomicContent({
      receiptId: id,
      source: "github",
      eventType: "issue_closed",
      platformUserId: authorId,
      artifactUrl: issue.url,
      metadata,
      eventTime,
    });

    return {
      id,
      source: "github",
      eventType: "issue_closed",
      platformUserId: authorId,
      platformLogin: issue.author.login,
      artifactUrl: issue.url,
      metadata,
      payloadHash,
      eventTime,
    };
  }

  // -------------------------------------------------------------------------
  // Private: GraphQL execution via Octokit client
  // Rate limiting is handled by @octokit/plugin-retry + @octokit/plugin-throttling.
  // -------------------------------------------------------------------------

  private async executeQuery<T>(
    query: string,
    variables: Record<string, unknown>
  ): Promise<T> {
    const client = await this.getClient();
    return client.graphql<T>(query, variables);
  }
}
