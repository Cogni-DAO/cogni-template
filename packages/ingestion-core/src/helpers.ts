// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/ingestion-core/helpers`
 * Purpose: Pure helper functions for deterministic event IDs and canonical payload hashing.
 * Scope: Zero deps beyond Web Crypto (globalThis.crypto). Platform-neutral. Does not perform network I/O or access databases.
 * Invariants:
 * - buildEventId() output is deterministic for the same inputs.
 * - canonicalJson() recursively sorts object keys and preserves array order.
 * - hashCanonicalPayload() produces identical SHA-256 for identical canonical fields.
 * Side-effects: none
 * Links: docs/spec/attribution-ledger.md (ACTIVITY_IDEMPOTENT, PROVENANCE_REQUIRED)
 * @public
 */

import {
  RECEIPT_CONTEXT_SCHEMA_VERSION,
  type ReceiptContent,
  type ReceiptEconomicContent,
} from "./model";

/**
 * Build a deterministic event ID from source, type, and scope parts.
 *
 * @example
 * buildEventId("github", "pr", "owner/repo", 42)
 * // => "github:pr:owner/repo:42"
 *
 * buildEventId("github", "review", "owner/repo", 42, 1234567)
 * // => "github:review:owner/repo:42:1234567"
 *
 * buildEventId("discord", "message", "guild123", "channel456", "msg789")
 * // => "discord:message:guild123:channel456:msg789"
 */
export function buildEventId(
  source: string,
  type: string,
  ...parts: (string | number)[]
): string {
  return `${source}:${type}:${parts.join(":")}`;
}

/**
 * Produce canonical JSON with sorted keys for deterministic serialization.
 * Only sorts top-level keys — nested objects are serialized as-is.
 *
 * @example
 * canonicalJson({ b: 2, a: 1 })
 * // => '{"a":1,"b":2}'
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);

  const object = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(object).sort()) {
    if (object[key] !== undefined) sorted[key] = canonicalize(object[key]);
  }
  return sorted;
}

/**
 * SHA-256 hash of canonical payload fields via Web Crypto.
 * Returns lowercase hex string (64 chars).
 *
 * @example
 * await hashCanonicalPayload({ id: "github:pr:owner/repo:42", authorId: "12345", mergedAt: "2026-01-15T00:00:00Z" })
 * // => "a1b2c3d4..."  (deterministic for same input)
 */
export async function hashCanonicalPayload(
  canonicalFields: Record<string, unknown>
): Promise<string> {
  const json = canonicalJson(canonicalFields);
  const data = new TextEncoder().encode(json);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Project a receipt snapshot onto immutable economic identity. Mutable GitHub
 * presentation/enrichment is intentionally absent so a later polling replay
 * does not conflict with the webhook snapshot captured at event time.
 */
export function toReceiptEconomicContent(
  content: ReceiptContent
): ReceiptEconomicContent {
  const metadata = content.metadata;
  let economicContext: Record<string, unknown>;
  switch (content.eventType) {
    case "pr_merged":
      economicContext = {
        providerRepoId: metadata.providerRepoId,
        prNumber: metadata.prNumber,
        baseBranch: metadata.baseBranch,
        mergedById: metadata.mergedById,
        mergeCommitSha: metadata.mergeCommitSha,
        commitShas: metadata.commitShas,
        additions: metadata.additions,
        deletions: metadata.deletions,
        changedFiles: metadata.changedFiles,
      };
      break;
    case "pr_opened":
    case "pr_closed":
      economicContext = {
        providerRepoId: metadata.providerRepoId,
        prNumber: metadata.prNumber,
      };
      break;
    case "review_submitted":
      economicContext = {
        providerRepoId: metadata.providerRepoId,
        prNumber: metadata.prNumber,
      };
      break;
    case "issue_opened":
    case "issue_closed":
    case "comment_created":
      economicContext = {
        providerRepoId: metadata.providerRepoId,
        issueNumber: metadata.issueNumber,
      };
      break;
    case "commit_pushed":
      economicContext = {
        providerRepoId: metadata.providerRepoId,
        ref: metadata.ref,
        after: metadata.after,
        commitCount: metadata.commitCount,
      };
      break;
    case "cogni_signal":
      economicContext = { txHash: metadata.txHash };
      break;
  }

  return {
    schemaVersion: RECEIPT_CONTEXT_SCHEMA_VERSION,
    source: content.source,
    eventType: content.eventType,
    platformUserId: content.platformUserId,
    economicContext,
    eventTime:
      content.eventTime instanceof Date
        ? content.eventTime.toISOString()
        : new Date(content.eventTime).toISOString(),
  };
}

/** SHA-256 of immutable economic receipt identity, excluding mutable snapshots. */
export async function hashReceiptEconomicContent(
  content: ReceiptContent
): Promise<string> {
  return hashCanonicalPayload({ ...toReceiptEconomicContent(content) });
}
