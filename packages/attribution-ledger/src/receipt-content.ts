// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/attribution-ledger/receipt-content`
 * Purpose: Compare immutable economic receipt identity while excluding mutable snapshots and delivery provenance.
 * Scope: Pure equality only. Does not persist or mutate receipts.
 * Invariants: presentation/enrichment and delivery provenance do not change economic identity.
 * Side-effects: none
 * Links: story.5023
 * @public
 */

import type { IngestionReceipt, InsertReceiptParams } from "./store";

type ReceiptContentComparable = Pick<
  IngestionReceipt | InsertReceiptParams,
  "source" | "eventType" | "platformUserId" | "payloadHash" | "eventTime"
>;

export function sameReceiptEconomicContent(
  stored: ReceiptContentComparable,
  incoming: ReceiptContentComparable
): boolean {
  return (
    stored.source === incoming.source &&
    stored.eventType === incoming.eventType &&
    stored.platformUserId === incoming.platformUserId &&
    stored.eventTime.getTime() === incoming.eventTime.getTime() &&
    stored.payloadHash === incoming.payloadHash
  );
}
