// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/attribution-ledger/pool`
 * Purpose: Pure finite-budget reservation policy for eligible attribution epochs.
 * Scope: Pure functions. Does not perform I/O or hold state.
 * Invariants:
 * - POOL_REPRODUCIBLE: Each pool component stores algorithm_version + inputs_json + amount_credits. Pure function.
 * - ALL_MATH_BIGINT: All credit values use BigInt.
 * - BUDGET_HARD_CAP: cumulative reservations never exceed budget_total.
 * Side-effects: none
 * Links: docs/spec/attribution-ledger.md
 * @public
 */

export interface PoolComponentEstimate {
  readonly componentId: string;
  readonly algorithmVersion: string;
  readonly inputsJson: Record<string, unknown>;
  readonly amountCredits: bigint;
  readonly evidenceRef?: string;
}

export const BUDGET_RESERVATION_COMPONENT_ID = "budget_reservation" as const;
export const BUDGET_RESERVATION_ALGORITHM = "flat-cap-v1" as const;

/**
 * Compute the append-only reservation for one epoch.
 * Quiet and exhausted epochs reserve nothing and therefore emit no component.
 */
export function computeEpochBudgetReservation(config: {
  budgetTotal: bigint;
  accrualPerEpoch: bigint;
  reservedBefore: bigint;
  hasIncludedReceipts: boolean;
}): PoolComponentEstimate[] {
  if (config.budgetTotal <= 0n) {
    throw new RangeError("budgetTotal must be positive");
  }
  if (config.accrualPerEpoch <= 0n) {
    throw new RangeError("accrualPerEpoch must be positive");
  }
  if (config.accrualPerEpoch > config.budgetTotal) {
    throw new RangeError("accrualPerEpoch must not exceed budgetTotal");
  }
  if (config.reservedBefore < 0n) {
    throw new RangeError("reservedBefore must not be negative");
  }
  if (
    !config.hasIncludedReceipts ||
    config.reservedBefore >= config.budgetTotal
  ) {
    return [];
  }

  const remaining = config.budgetTotal - config.reservedBefore;
  const amountCredits =
    config.accrualPerEpoch < remaining ? config.accrualPerEpoch : remaining;
  return [
    {
      componentId: BUDGET_RESERVATION_COMPONENT_ID,
      algorithmVersion: BUDGET_RESERVATION_ALGORITHM,
      inputsJson: {
        budgetTotal: config.budgetTotal.toString(),
        accrualPerEpoch: config.accrualPerEpoch.toString(),
        reservedBefore: config.reservedBefore.toString(),
      },
      amountCredits,
    },
  ];
}
