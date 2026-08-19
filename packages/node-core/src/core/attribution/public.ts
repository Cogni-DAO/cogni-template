// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@core/attribution/public`
 * Purpose: Re-exports from @cogni/attribution-ledger so app code uses @/core/attribution unchanged.
 * Scope: Re-exports only. Does not define any logic.
 * Invariants: Only exports stable public interfaces and functions.
 * Side-effects: none
 * Links: docs/spec/attribution-ledger.md, packages/attribution-ledger/
 * @public
 */

// Store port re-exports
export type {
  AttributionEpoch,
  AttributionPoolComponent,
  AttributionSelection,
  AttributionStatement,
  AttributionStatementSignature,
  AttributionStore,
  EpochStatus,
  EpochUserProjection,
  FinalizedAllocation,
  IngestionCursor,
  IngestionReceipt,
  InsertReceiptParams,
  InsertSignatureParams,
  InsertStatementParams,
  InsertUserProjectionParams,
  ReserveEpochBudgetParams,
  StatementLineItem,
  UpsertSelectionParams,
} from "@cogni/attribution-ledger";
export {
  AllocationNotFoundError,
  ATTRIBUTION_STATEMENT_TYPES,
  // Legacy user-only helpers remain exported here for compatibility with older
  // core consumers. New claimant-aware flows should use
  // computeFinalClaimantAllocationSetHash() and computeAttributionStatementLines().
  computeAllocationSetHash,
  computeStatementItems,
  EPOCH_STATUSES,
  EpochAlreadyFinalizedError,
  EpochNotFoundError,
  EpochNotOpenError,
  isAllocationNotFoundError,
  isEpochAlreadyFinalizedError,
  isEpochNotFoundError,
  isEpochNotOpenError,
} from "@cogni/attribution-ledger";
