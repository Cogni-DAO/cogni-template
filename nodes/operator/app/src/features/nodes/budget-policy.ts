// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/nodes/budget-policy`
 * Purpose: Derive the finite distributable credit budget from DAO formation token units.
 * Scope: Pure whole-token conversion only; does not perform IO or choose an accrual rate.
 * Invariants: FORMATION_DERIVES_BUDGET, WHOLE_TOKEN_CREDITS, GENESIS_NOT_DISTRIBUTABLE.
 * Side-effects: none
 * Links: docs/spec/tokenomics.md, bug.5051
 * @public
 */

import { DAO_TOKEN_SUPPLY_MAX_WHOLE } from "@cogni/aragon-osx";

const TOKEN_BASE_UNITS = 10n ** 18n;
const MAX_POLICY_SUPPLY_UNITS =
  BigInt(DAO_TOKEN_SUPPLY_MAX_WHOLE) * TOKEN_BASE_UNITS;

export function deriveDistributionBudgetTotalCredits(input: {
  policySupplyUnits: bigint;
  genesisMintUnits: bigint;
}): bigint {
  if (input.policySupplyUnits <= 0n || input.genesisMintUnits <= 0n) {
    throw new RangeError("formation token amounts must be positive");
  }
  if (input.policySupplyUnits > MAX_POLICY_SUPPLY_UNITS) {
    throw new RangeError("policy supply exceeds the formation maximum");
  }
  if (input.genesisMintUnits >= input.policySupplyUnits) {
    throw new RangeError("genesis mint must be less than policy supply");
  }
  if (
    input.policySupplyUnits % TOKEN_BASE_UNITS !== 0n ||
    input.genesisMintUnits % TOKEN_BASE_UNITS !== 0n
  ) {
    throw new RangeError(
      "formation token amounts must be whole 18-decimal tokens"
    );
  }
  return (input.policySupplyUnits - input.genesisMintUnits) / TOKEN_BASE_UNITS;
}
