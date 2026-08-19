// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/unit/packages/attribution-ledger/pool`
 * Purpose: Unit tests for finite epoch budget reservation math.
 * Scope: Pure policy only; does not test store or I/O.
 * Invariants: POOL_REPRODUCIBLE, ALL_MATH_BIGINT, BUDGET_HARD_CAP.
 * Side-effects: none
 * Links: packages/attribution-ledger/src/pool.ts
 * @internal
 */

import { computeEpochBudgetReservation } from "@cogni/attribution-ledger";
import { describe, expect, it } from "vitest";

describe("computeEpochBudgetReservation", () => {
  it("reserves one deterministic accrual for an eligible epoch", () => {
    const result = computeEpochBudgetReservation({
      budgetTotal: 520000n,
      accrualPerEpoch: 10000n,
      reservedBefore: 20000n,
      hasIncludedReceipts: true,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      componentId: "budget_reservation",
      algorithmVersion: "flat-cap-v1",
      inputsJson: {
        budgetTotal: "520000",
        accrualPerEpoch: "10000",
        reservedBefore: "20000",
      },
      amountCredits: 10000n,
    });
  });

  it("caps the final reservation at remaining budget", () => {
    const result = computeEpochBudgetReservation({
      budgetTotal: 25000n,
      accrualPerEpoch: 10000n,
      reservedBefore: 20000n,
      hasIncludedReceipts: true,
    });
    expect(result[0]?.amountCredits).toBe(5000n);
  });

  it("spends nothing for quiet or exhausted epochs", () => {
    expect(
      computeEpochBudgetReservation({
        budgetTotal: 10000n,
        accrualPerEpoch: 1000n,
        reservedBefore: 0n,
        hasIncludedReceipts: false,
      })
    ).toEqual([]);
    expect(
      computeEpochBudgetReservation({
        budgetTotal: 10000n,
        accrualPerEpoch: 1000n,
        reservedBefore: 10000n,
        hasIncludedReceipts: true,
      })
    ).toEqual([]);
  });

  it("rejects malformed policies before reservation", () => {
    expect(() =>
      computeEpochBudgetReservation({
        budgetTotal: 999n,
        accrualPerEpoch: 1000n,
        reservedBefore: 0n,
        hasIncludedReceipts: true,
      })
    ).toThrow(/must not exceed/);
  });
});
