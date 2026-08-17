// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/ingestion-core/github-context`
 * Purpose: Canonical GitHub receipt context builders shared by poll and webhook producers.
 * Scope: Pure normalized metadata construction. Does not parse GitHub payloads or perform I/O.
 * Invariants: PRODUCER_CONVERGENCE — equal source facts produce equal context objects.
 * Side-effects: none
 * Links: task.5023
 * @public
 */

import { RECEIPT_CONTEXT_SCHEMA_VERSION } from "./model";

export interface GitHubPrMergedContextV1Input {
  readonly providerRepoId: string;
  readonly repo: string;
  readonly prNumber: number;
  readonly title: string;
  readonly body: string;
  readonly baseBranch: string;
  readonly branch: string;
  readonly mergeCommitSha: string;
  readonly mergedById: string;
  readonly commitShas: readonly string[];
  readonly labels: readonly string[];
  readonly additions: number;
  readonly deletions: number;
  readonly changedFiles: number;
}

export function buildGitHubPrMergedContextV1(
  input: GitHubPrMergedContextV1Input
): Record<string, unknown> {
  return {
    schemaVersion: RECEIPT_CONTEXT_SCHEMA_VERSION,
    providerRepoId: input.providerRepoId,
    repo: input.repo,
    prNumber: input.prNumber,
    title: input.title,
    body: input.body,
    baseBranch: input.baseBranch,
    branch: input.branch,
    mergeCommitSha: input.mergeCommitSha,
    mergedById: input.mergedById,
    commitShas: [...input.commitShas],
    // GitHub does not promise identical connection/webhook ordering for labels.
    // Label order carries no attribution meaning, so normalize it here.
    labels: [...input.labels].sort(),
    additions: input.additions,
    deletions: input.deletions,
    changedFiles: input.changedFiles,
    action: "closed",
  };
}

export interface GitHubReviewContextV1Input {
  readonly providerRepoId: string;
  readonly repo: string;
  readonly prNumber: number;
  readonly reviewId: number;
  readonly prBaseBranch: string;
  readonly prMergeCommitSha: string | null;
  readonly state: string;
}

export function buildGitHubReviewContextV1(
  input: GitHubReviewContextV1Input
): Record<string, unknown> {
  return {
    schemaVersion: RECEIPT_CONTEXT_SCHEMA_VERSION,
    providerRepoId: input.providerRepoId,
    repo: input.repo,
    prNumber: input.prNumber,
    reviewId: input.reviewId,
    prBaseBranch: input.prBaseBranch,
    prMergeCommitSha: input.prMergeCommitSha,
    state: input.state.toLowerCase(),
  };
}

export interface GitHubIssueContextV1Input {
  readonly providerRepoId: string;
  readonly repo: string;
  readonly issueNumber: number;
  readonly title: string;
  readonly action: "opened" | "closed";
}

export function buildGitHubIssueContextV1(
  input: GitHubIssueContextV1Input
): Record<string, unknown> {
  return {
    schemaVersion: RECEIPT_CONTEXT_SCHEMA_VERSION,
    providerRepoId: input.providerRepoId,
    repo: input.repo,
    issueNumber: input.issueNumber,
    title: input.title,
    action: input.action,
  };
}
