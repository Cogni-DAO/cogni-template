// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/ingestion/github-webhook`
 * Purpose: GitHub webhook normalizer — verifies signature and normalizes webhook payloads to ActivityEvent[].
 * Scope: Implements WebhookNormalizer from @cogni/ingestion-core. Uses @octokit/webhooks-methods for HMAC-SHA256 verification. Does not perform HTTP I/O or hold mutable state.
 * Invariants:
 * - WEBHOOK_VERIFY_VIA_OSS: Signature verification via @octokit/webhooks-methods (not bespoke crypto)
 * - WEBHOOK_VERIFY_BEFORE_NORMALIZE: verify() must be called before normalize() — enforced by feature service
 * - ACTIVITY_IDEMPOTENT: Deterministic event IDs from source data (same as poll adapter)
 * - INGEST_ALL_FILTER_LATER: Normalizer captures all actionable events; downstream selection decides what's attributable
 * Side-effects: none
 * Links: docs/spec/attribution-ledger.md
 * @internal
 */

import type {
  ActivityEvent,
  ReceiptEventType,
  WebhookNormalizer,
} from "@cogni/ingestion-core";
import {
  buildEventId,
  buildGitHubIssueContextV1,
  buildGitHubPrMergedContextV1,
  buildGitHubReviewContextV1,
  GITHUB_ADAPTER_VERSION,
  hashReceiptEconomicContent,
  RECEIPT_CONTEXT_SCHEMA_VERSION,
} from "@cogni/ingestion-core";
import { verify } from "@octokit/webhooks-methods";

export { GITHUB_ADAPTER_VERSION };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface GitHubUser {
  id: number;
  login: string;
  type: string;
}

export interface GitHubMergedPrHydrationInput {
  readonly installationId: number;
  readonly owner: string;
  readonly repo: string;
  readonly prNumber: number;
}

/** GitHub App-backed enrichment required because webhooks omit commit SHAs. */
export type GitHubMergedPrHydrator = (
  input: GitHubMergedPrHydrationInput
) => Promise<readonly string[]>;

type ReceiptEventDraft = Omit<ActivityEvent, "payloadHash"> & {
  readonly source: "github";
  readonly eventType: ReceiptEventType;
  readonly metadata: Record<string, unknown>;
};

async function finalizeReceiptEvent(
  event: ReceiptEventDraft
): Promise<ActivityEvent> {
  return {
    ...event,
    payloadHash: await hashReceiptEconomicContent({
      receiptId: event.id,
      source: event.source,
      eventType: event.eventType,
      platformUserId: event.platformUserId,
      artifactUrl: event.artifactUrl,
      metadata: event.metadata,
      eventTime: event.eventTime,
    }),
  };
}

/**
 * Extract actor from a webhook payload. Returns null for bots/mannequins.
 * Bot filtering is a data-quality concern (bots don't have stable numeric IDs),
 * not a selection concern.
 */
function extractActor(
  user: Record<string, unknown> | null | undefined
): { id: string; login: string } | null {
  if (!user) return null;
  const typed = user as unknown as GitHubUser;
  if (typed.type !== "User") return null;
  if (!typed.id) return null;
  return { id: String(typed.id), login: typed.login };
}

function repoFullName(payload: Record<string, unknown>): string | null {
  const repo = payload.repository as Record<string, unknown> | undefined;
  return (repo?.full_name as string) ?? null;
}

function providerRepoId(payload: Record<string, unknown>): string | null {
  const repo = payload.repository as Record<string, unknown> | undefined;
  const nodeId = repo?.node_id;
  return typeof nodeId === "string" && nodeId.length > 0 ? nodeId : null;
}

// ---------------------------------------------------------------------------
// Normalizer
// ---------------------------------------------------------------------------

/**
 * GitHub webhook normalizer.
 * Captures all actionable GitHub events — downstream selection decides what's attributable.
 * Uses @octokit/webhooks-methods for HMAC-SHA256 signature verification.
 */
export class GitHubWebhookNormalizer implements WebhookNormalizer {
  constructor(private readonly hydrateMergedPr?: GitHubMergedPrHydrator) {}

  readonly supportedEvents = [
    "pull_request",
    "pull_request_review",
    "issues",
    "issue_comment",
    "push",
  ] as const satisfies readonly string[];

  async verify(
    headers: Record<string, string>,
    body: Buffer,
    secret: string
  ): Promise<boolean> {
    const signature = headers["x-hub-signature-256"];
    if (!signature) return false;

    try {
      return await verify(secret, body.toString("utf-8"), signature);
    } catch {
      return false;
    }
  }

  async normalize(
    headers: Record<string, string>,
    body: unknown
  ): Promise<ActivityEvent[]> {
    const eventType = headers["x-github-event"];
    const payload = body as Record<string, unknown>;

    switch (eventType) {
      case "pull_request":
        return this.normalizePullRequest(payload);
      case "pull_request_review":
        return this.normalizePullRequestReview(payload);
      case "issues":
        return this.normalizeIssue(payload);
      case "issue_comment":
        return this.normalizeIssueComment(payload);
      case "push":
        return this.normalizePush(payload);
      default:
        // Events we don't have a specific normalizer for are dropped.
        // Add normalizers here as we expand ingestion coverage.
        return [];
    }
  }

  // -------------------------------------------------------------------------
  // Pull Request — all actions (opened, closed/merged, reopened, etc.)
  // -------------------------------------------------------------------------

  private async normalizePullRequest(
    payload: Record<string, unknown>
  ): Promise<ActivityEvent[]> {
    const action = payload.action as string;
    const pr = payload.pull_request as Record<string, unknown> | undefined;
    if (!pr) return [];

    const fullName = repoFullName(payload);
    const repoId = providerRepoId(payload);
    if (!fullName || !repoId) return [];

    const actor = extractActor(pr.user as Record<string, unknown>);
    if (!actor) return [];

    const prNumber = pr.number as number;
    const isMerged = action === "closed" && pr.merged === true;

    // Determine the canonical event type and timestamp
    if (!isMerged && action !== "opened" && action !== "closed") return [];
    const eventType: ReceiptEventType = isMerged
      ? "pr_merged"
      : action === "opened"
        ? "pr_opened"
        : "pr_closed";
    const eventTime = isMerged
      ? (pr.merged_at as string)
      : ((pr.updated_at as string) ?? (pr.created_at as string));

    if (!eventTime) return [];

    const id = isMerged
      ? buildEventId("github", "pr", fullName, prNumber)
      : buildEventId("github", "pr", fullName, prNumber, action);

    const base = pr.base as Record<string, unknown> | undefined;
    const head = pr.head as Record<string, unknown> | undefined;
    const labels = Array.isArray(pr.labels)
      ? pr.labels
          .map((label) => (label as Record<string, unknown>).name)
          .filter((name): name is string => typeof name === "string")
      : [];
    const commonMetadata = {
      schemaVersion: RECEIPT_CONTEXT_SCHEMA_VERSION,
      providerRepoId: repoId,
      repo: fullName,
      prNumber,
      title: pr.title as string,
      body: (pr.body as string | null) ?? "",
      baseBranch: base?.ref as string,
      branch: head?.ref as string,
      labels,
      action: action as "opened" | "closed",
    };

    let metadata: Record<string, unknown> = commonMetadata;
    if (isMerged) {
      const installation = payload.installation as
        | Record<string, unknown>
        | undefined;
      const installationId = installation?.id;
      if (typeof installationId !== "number" || !this.hydrateMergedPr) {
        throw new Error(
          "Merged PR receipt requires GitHub App installation hydration"
        );
      }
      const [owner, repo] = fullName.split("/");
      if (!owner || !repo) return [];
      const mergedBy = pr.merged_by as Record<string, unknown> | undefined;
      const mergedById = mergedBy?.node_id;
      const mergeCommitSha = pr.merge_commit_sha;
      if (
        typeof mergedById !== "string" ||
        mergedById.length === 0 ||
        typeof mergeCommitSha !== "string" ||
        mergeCommitSha.length === 0
      ) {
        throw new Error("Merged PR receipt requires immutable merge identity");
      }
      const commitShas = await this.hydrateMergedPr({
        installationId,
        owner,
        repo,
        prNumber,
      });
      if (commitShas.length === 0) {
        throw new Error("Merged PR receipt requires at least one commit SHA");
      }
      metadata = buildGitHubPrMergedContextV1({
        providerRepoId: repoId,
        repo: fullName,
        prNumber,
        title: pr.title as string,
        body: (pr.body as string | null) ?? "",
        baseBranch: base?.ref as string,
        branch: head?.ref as string,
        mergeCommitSha,
        mergedById,
        commitShas,
        labels,
        additions: (pr.additions as number | undefined) ?? 0,
        deletions: (pr.deletions as number | undefined) ?? 0,
        changedFiles: (pr.changed_files as number | undefined) ?? 0,
      });
    }

    return [
      await finalizeReceiptEvent({
        id,
        source: "github",
        eventType,
        platformUserId: actor.id,
        platformLogin: actor.login,
        artifactUrl: pr.html_url as string,
        metadata,
        eventTime: new Date(eventTime),
      }),
    ];
  }

  // -------------------------------------------------------------------------
  // Pull Request Review — submitted, edited, dismissed
  // -------------------------------------------------------------------------

  private async normalizePullRequestReview(
    payload: Record<string, unknown>
  ): Promise<ActivityEvent[]> {
    const action = payload.action as string;
    if (action !== "submitted") return [];

    const review = payload.review as Record<string, unknown> | undefined;
    if (!review) return [];

    const pr = payload.pull_request as Record<string, unknown> | undefined;
    if (!pr) return [];

    const fullName = repoFullName(payload);
    const repoId = providerRepoId(payload);
    if (!fullName || !repoId) return [];

    const actor = extractActor(review.user as Record<string, unknown>);
    if (!actor) return [];

    const prNumber = pr.number as number;
    const reviewId = review.id as number;
    const submittedAt = review.submitted_at as string;
    if (!submittedAt) return [];

    const id = buildEventId("github", "review", fullName, prNumber, reviewId);

    const base = pr.base as Record<string, unknown> | undefined;

    return [
      await finalizeReceiptEvent({
        id,
        source: "github",
        eventType: "review_submitted",
        platformUserId: actor.id,
        platformLogin: actor.login,
        artifactUrl: review.html_url as string,
        metadata: buildGitHubReviewContextV1({
          providerRepoId: repoId,
          repo: fullName,
          prNumber,
          prBaseBranch: base?.ref as string,
          prMergeCommitSha:
            (pr.merge_commit_sha as string | null | undefined) ?? null,
          state: review.state as string,
        }),
        eventTime: new Date(submittedAt),
      }),
    ];
  }

  // -------------------------------------------------------------------------
  // Issues — all actions (opened, closed, reopened, labeled, etc.)
  // -------------------------------------------------------------------------

  private async normalizeIssue(
    payload: Record<string, unknown>
  ): Promise<ActivityEvent[]> {
    const action = payload.action as string;
    const issue = payload.issue as Record<string, unknown> | undefined;
    if (!issue) return [];

    const fullName = repoFullName(payload);
    const repoId = providerRepoId(payload);
    if (!fullName || !repoId) return [];

    const actor = extractActor(issue.user as Record<string, unknown>);
    if (!actor) return [];

    const issueNumber = issue.number as number;
    const isClosed = action === "closed";

    if (!isClosed && action !== "opened") return [];
    const eventType: ReceiptEventType = isClosed
      ? "issue_closed"
      : "issue_opened";
    const eventTime = isClosed
      ? (issue.closed_at as string)
      : ((issue.updated_at as string) ?? (issue.created_at as string));

    if (!eventTime) return [];

    const id = isClosed
      ? buildEventId("github", "issue", fullName, issueNumber)
      : buildEventId("github", "issue", fullName, issueNumber, action);

    return [
      await finalizeReceiptEvent({
        id,
        source: "github",
        eventType,
        platformUserId: actor.id,
        platformLogin: actor.login,
        artifactUrl: issue.html_url as string,
        metadata: buildGitHubIssueContextV1({
          providerRepoId: repoId,
          repo: fullName,
          issueNumber,
          title: issue.title as string,
          action: isClosed ? "closed" : "opened",
        }),
        eventTime: new Date(eventTime),
      }),
    ];
  }

  // -------------------------------------------------------------------------
  // Issue Comment — created (on issues and PRs)
  // -------------------------------------------------------------------------

  private async normalizeIssueComment(
    payload: Record<string, unknown>
  ): Promise<ActivityEvent[]> {
    const action = payload.action as string;
    if (action !== "created") return [];

    const comment = payload.comment as Record<string, unknown> | undefined;
    if (!comment) return [];

    const issue = payload.issue as Record<string, unknown> | undefined;
    if (!issue) return [];

    const fullName = repoFullName(payload);
    const repoId = providerRepoId(payload);
    if (!fullName || !repoId) return [];

    const actor = extractActor(comment.user as Record<string, unknown>);
    if (!actor) return [];

    const commentId = comment.id as number;
    const createdAt = comment.created_at as string;
    if (!createdAt) return [];

    const id = buildEventId("github", "comment", fullName, commentId);

    return [
      await finalizeReceiptEvent({
        id,
        source: "github",
        eventType: "comment_created",
        platformUserId: actor.id,
        platformLogin: actor.login,
        artifactUrl: comment.html_url as string,
        metadata: {
          schemaVersion: RECEIPT_CONTEXT_SCHEMA_VERSION,
          providerRepoId: repoId,
          issueNumber: issue.number as number,
          repo: fullName,
        },
        eventTime: new Date(createdAt),
      }),
    ];
  }

  // -------------------------------------------------------------------------
  // Push — commits pushed to a branch
  // -------------------------------------------------------------------------

  private async normalizePush(
    payload: Record<string, unknown>
  ): Promise<ActivityEvent[]> {
    const fullName = repoFullName(payload);
    const repoId = providerRepoId(payload);
    if (!fullName || !repoId) return [];

    const sender = payload.sender as Record<string, unknown> | undefined;
    const actor = extractActor(sender);
    if (!actor) return [];

    const ref = payload.ref as string;
    const after = payload.after as string;
    const commits = payload.commits as
      | Array<Record<string, unknown>>
      | undefined;
    const commitCount = commits?.length ?? 0;

    if (!after || after === "0000000000000000000000000000000000000000")
      return [];

    const id = buildEventId("github", "push", fullName, after);

    const headCommit = payload.head_commit as
      | Record<string, unknown>
      | undefined;
    const eventTime = headCommit?.timestamp as string | undefined;
    if (!eventTime) return [];

    return [
      await finalizeReceiptEvent({
        id,
        source: "github",
        eventType: "commit_pushed",
        platformUserId: actor.id,
        platformLogin: actor.login,
        artifactUrl: `https://github.com/${fullName}/commit/${after}`,
        metadata: {
          schemaVersion: RECEIPT_CONTEXT_SCHEMA_VERSION,
          providerRepoId: repoId,
          ref,
          after,
          commitCount,
          repo: fullName,
        },
        eventTime: new Date(eventTime),
      }),
    ];
  }
}
