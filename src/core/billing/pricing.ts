// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@core/billing/pricing`
 * Purpose: Credits-centric pricing calculations for LLM usage billing.
 * Scope: Pure functions that convert USD to credits and apply markup. Does not access adapters or IO.
 * Invariants: Always rounds up to ensure minimum 1 credit for non-zero costs; markup factor always ≥1.0; uses BigInt for credit amounts.
 * Side-effects: none
 * Notes: Credits are the atomic unit; USD amounts converted at configured rate. User price always ≥ provider cost.
 * Links: Used by AI completion service for dual-cost accounting.
 * @public
 */

/**
 * Convert USD cost to credits using the configured conversion rate.
 * Always rounds up to ensure minimum 1 credit for any non-zero cost.
 *
 * @param usd - Cost in USD
 * @param creditsPerUsd - Conversion rate (e.g., 1000 credits per USD)
 * @returns Credits as BigInt
 */
export function usdToCredits(usd: number, creditsPerUsd: number): bigint {
  const credits = Math.ceil(usd * creditsPerUsd);
  return BigInt(credits);
}

/**
 * Calculates the user price in credits based on the provider cost in credits.
 * Applies the markup factor and rounds up.
 * Enforces that user price is at least the provider cost (profit margin >= 0).
 */
export function calculateUserPriceCredits(
  providerCostCredits: bigint,
  markupFactor: number
): bigint {
  // Calculate price with markup
  // Convert BigInt to number for multiplication, then ceil, then back to BigInt
  // Note: For very large numbers, precision loss might occur, but credits are likely within safe integer range for number (2^53).
  // 1 credit = $0.001. 2^53 credits = $9 trillion. Safe.
  const price = Math.ceil(Number(providerCostCredits) * markupFactor);
  const userPriceCredits = BigInt(price);

  // Enforce profit margin invariant: Price >= Cost
  return userPriceCredits >= providerCostCredits
    ? userPriceCredits
    : providerCostCredits;
}
