// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/attribution-ledger/receipt-content`
 * Purpose: Compare append-only receipt content while excluding delivery provenance.
 * Scope: Pure equality only. Does not persist or mutate receipts.
 * Invariants: producer, producerVersion, retrievedAt, and platformLogin do not change semantic identity.
 * Side-effects: none
 * Links: story.5023
 * @public
 */

import { canonicalJsonStringify } from "./hashing";
import type { IngestionReceipt, InsertReceiptParams } from "./store";

type ReceiptContentComparable = Pick<
  IngestionReceipt | InsertReceiptParams,
  | "source"
  | "eventType"
  | "platformUserId"
  | "artifactUrl"
  | "metadata"
  | "payloadHash"
  | "eventTime"
>;

export function sameReceiptSemanticContent(
  stored: ReceiptContentComparable,
  incoming: ReceiptContentComparable
): boolean {
  return (
    stored.source === incoming.source &&
    stored.eventType === incoming.eventType &&
    stored.platformUserId === incoming.platformUserId &&
    (stored.artifactUrl ?? null) === (incoming.artifactUrl ?? null) &&
    stored.eventTime.getTime() === incoming.eventTime.getTime() &&
    stored.payloadHash === incoming.payloadHash &&
    canonicalJsonStringify(stored.metadata ?? null) ===
      canonicalJsonStringify(incoming.metadata ?? null)
  );
}
