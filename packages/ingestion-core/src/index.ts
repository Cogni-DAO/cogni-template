// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/ingestion-core`
 * Purpose: Pure domain types, port interface, and helpers for activity ingestion source adapters.
 * Scope: Purpose-neutral — shared across ledger and governance consumers. Does not contain adapter deps, I/O, or framework code.
 * Invariants:
 * - ADAPTERS_NOT_IN_CORE: Only types + pure helpers here. Implementations in services/.
 * - No imports from src/ or services/. Pure domain package.
 * Side-effects: none
 * Links: docs/spec/attribution-ledger.md#source-adapter-interface
 * @public
 */

export {
  GITHUB_PULL_REQUEST_COMMITS_QUERY,
  parseGitHubPullRequestCommitsPage,
  type GitHubPullRequestCommitsPage,
  type ParsedGitHubPullRequestCommitsPage,
} from "./github-commit-pagination";
export {
  buildGitHubIssueContextV1,
  buildGitHubPrMergedContextV1,
  buildGitHubReviewContextV1,
  type GitHubIssueContextV1Input,
  type GitHubPrMergedContextV1Input,
  type GitHubReviewContextV1Input,
} from "./github-context";
// Pure helpers
export {
  buildCanonicalReceiptId,
  buildEventId,
  canonicalJson,
  hashCanonicalPayload,
  hashReceiptEconomicContent,
  toReceiptDisplaySnapshotV1,
  toReceiptEconomicContent,
} from "./helpers";
// Model types
export type {
  ActivityEvent,
  CollectParams,
  CollectResult,
  ReceiptContent,
  ReceiptDisplaySnapshotV1,
  ReceiptEconomicContent,
  ReceiptEconomicCoreV1,
  ReceiptEventType,
  ReceiptProducer,
  ReceiptSource,
  StreamCursor,
  StreamDefinition,
} from "./model";
export {
  RECEIPT_CONTEXT_SCHEMA_VERSION,
  RECEIPT_EVENT_TYPES,
  RECEIPT_PRODUCERS,
  RECEIPT_SOURCES,
} from "./model";
// Port interfaces
export type {
  DataSourceRegistration,
  PollAdapter,
  SourceAdapter,
  WebhookNormalizer,
} from "./port";
export type { VcsTokenProvider, VcsTokenResult } from "./vcs-token-provider";
// Source adapter version constants
export { GITHUB_ADAPTER_VERSION } from "./versions";
