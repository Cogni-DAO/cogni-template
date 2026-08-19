// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/unit/features/nodes/budget-policy`
 * Purpose: Prove wizard formation derives one finite governance-policy budget, not an on-chain mint limit.
 * Scope: Pure unit tests; no wallet, chain, or database IO.
 * Invariants: FORMATION_DERIVES_BUDGET, WHOLE_TOKEN_CREDITS, GENESIS_NOT_DISTRIBUTABLE.
 * Side-effects: none
 * Links: src/features/nodes/budget-policy.ts, docs/spec/tokenomics.md
 * @internal
 */

import { describe, expect, it } from "vitest";

import { deriveDistributionBudgetTotalCredits } from "@/features/nodes/budget-policy";

const TOKEN = 10n ** 18n;

describe("deriveDistributionBudgetTotalCredits", () => {
  it("records policy supply minus genesis mint without claiming contract enforcement", () => {
    expect(
      deriveDistributionBudgetTotalCredits({
        policySupplyUnits: 520001n * TOKEN,
        genesisMintUnits: TOKEN,
      })
    ).toBe(520000n);
  });

  it.each([
    { policySupplyUnits: 0n, genesisMintUnits: TOKEN },
    { policySupplyUnits: 2n * TOKEN, genesisMintUnits: 2n * TOKEN },
    { policySupplyUnits: 2n * TOKEN + 1n, genesisMintUnits: TOKEN },
    { policySupplyUnits: 1_000_000_001n * TOKEN, genesisMintUnits: TOKEN },
  ])("rejects invalid formation amounts: %o", (input) => {
    expect(() => deriveDistributionBudgetTotalCredits(input)).toThrow(
      RangeError
    );
  });
});
