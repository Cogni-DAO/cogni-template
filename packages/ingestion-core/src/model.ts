// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/ingestion-core/model`
 * Purpose: Domain types for activity ingestion — purpose-neutral, shared across ledger and governance consumers.
 * Scope: Pure types. Does not contain I/O, business logic, or adapter deps.
 * Invariants:
 * - ActivityEvent is purpose-neutral: no epoch, user, node, receipt, or payout fields.
 * - Adapter-side type only — mapping to DB tables (which add node_id) is the workflow/store's job.
 * - payloadHash is SHA-256 of canonical immutable economic content.
 * Side-effects: none
 * Links: docs/spec/attribution-ledger.md#source-adapter-interface
 * @public
 */

/**
 * Raw activity event from an external source.
 * Purpose-neutral — consumed by ledger (→ curation → allocations) and governance (→ metrics, alerts).
 * The adapter produces these; the workflow/store maps them to DB rows with node_id, etc.
 */
export interface ActivityEvent {
  /**
   * Deterministic from source data. Format: "{source}:{type}:{scope}:{identifier}"
   * Examples: "github:pr:owner/repo:42", "discord:message:guild:channel:msgId"
   */
  readonly id: string;

  /** Source platform: "github", "discord", etc. */
  readonly source: string;

  /** Event classification: "pr_merged", "review_submitted", "message_sent", "issue_closed" */
  readonly eventType: string;

  /** Stable platform actor ID (GitHub numeric user ID, Discord snowflake). Never changes. */
  readonly platformUserId: string;

  /** Display-only actor name (GitHub username, Discord handle). May change over time. */
  readonly platformLogin?: string;

  /** Canonical URL to the activity artifact */
  readonly artifactUrl: string;

  /** Source-specific payload. No domain-specific fields — raw provenance data only. */
  readonly metadata: Record<string, unknown>;

  /** SHA-256 of canonical payload fields (PROVENANCE_REQUIRED) */
  readonly payloadHash: string;

  /** When the activity occurred on the source platform */
  readonly eventTime: Date;
}

/** Closed vocabulary for receipt transport and durable attribution context v1. */
export const RECEIPT_SOURCES = ["github", "alchemy"] as const;
export type ReceiptSource = (typeof RECEIPT_SOURCES)[number];

/**
 * Canonical normalized event names. Producers must drop unsupported source
 * actions instead of extending this vocabulary with string interpolation.
 */
export const RECEIPT_EVENT_TYPES = [
  "pr_merged",
  "pr_opened",
  "pr_closed",
  "review_submitted",
  "issue_opened",
  "issue_closed",
  "comment_created",
  "commit_pushed",
  "cogni_signal",
] as const;
export type ReceiptEventType = (typeof RECEIPT_EVENT_TYPES)[number];

/** First-party producers plus the two explicit controlled-ingress identities. */
export const RECEIPT_PRODUCERS = [
  "github:webhook",
  "github:poll",
  "alchemy:webhook",
  "bridge:manual",
  "replay:backfill",
] as const;
export type ReceiptProducer = (typeof RECEIPT_PRODUCERS)[number];

/** Version of the normalized metadata/context contract persisted on receipts. */
export const RECEIPT_CONTEXT_SCHEMA_VERSION = 1 as const;

/** Full receipt snapshot presented to the canonical economic hash projector. */
export interface ReceiptContent {
  readonly receiptId: string;
  readonly source: ReceiptSource;
  readonly eventType: ReceiptEventType;
  readonly platformUserId: string;
  readonly artifactUrl: string | null;
  readonly metadata: Record<string, unknown>;
  readonly eventTime: Date | string;
}

/**
 * Immutable identity/economic facts covered by payloadHash. Mutable display
 * snapshots (login, URLs, titles, bodies, labels, review state) are excluded.
 */
export interface ReceiptEconomicContent {
  readonly schemaVersion: typeof RECEIPT_CONTEXT_SCHEMA_VERSION;
  readonly source: ReceiptSource;
  readonly eventType: ReceiptEventType;
  readonly platformUserId: string;
  readonly economicContext: Record<string, unknown>;
  readonly eventTime: string;
}

/** Definition of a collectible stream within a source adapter. */
export interface StreamDefinition {
  /** Stream identifier: "pull_requests", "reviews", "issues", "messages" */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** How the cursor advances: ISO timestamp or opaque pagination token */
  readonly cursorType: "timestamp" | "token";

  /** Default polling interval in seconds */
  readonly defaultPollInterval: number;
}

/** Cursor checkpoint for incremental sync. One per (source, stream, scope). */
export interface StreamCursor {
  /** Which stream this cursor belongs to */
  readonly streamId: string;

  /** Cursor value: ISO timestamp or opaque token */
  readonly value: string;

  /** When this cursor was last used to fetch data */
  readonly retrievedAt: Date;
}

/** Parameters for a collect() call. */
export interface CollectParams {
  /** Which streams to collect from */
  readonly streams: string[];

  /** Resume from this cursor (null = start from window.since) */
  readonly cursor: StreamCursor | null;

  /** Time window to collect within */
  readonly window: { readonly since: Date; readonly until: Date };

  /** Maximum events to return (adapter may return fewer) */
  readonly limit?: number;
}

/** Result of a collect() call. */
export interface CollectResult {
  /** Collected events (may be empty if no new activity) */
  readonly events: readonly ActivityEvent[];

  /** Updated cursor for next incremental fetch */
  readonly nextCursor: StreamCursor;
}
