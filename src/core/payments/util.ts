// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@core/payments/util`
 * Purpose: Utility functions for payment domain calculations.
 * Scope: Pure helper functions for conversions and calculations. Does not perform I/O or side effects.
 * Invariants: USDC has 6 decimals; 1 USDC = 1,000,000 raw units; 1 USD = 100 cents.
 * Side-effects: none (pure functions)
 * Notes: Conversion ratio: 1 USD cent = 10,000 raw USDC units.
 * Links: Used by feature services and adapters
 * @public
 */

/**
 * Converts USD cents to USDC raw units (6 decimals)
 * 1 USDC = 1,000,000 raw units
 * 1 USD = 100 cents = 10,000 raw USDC units
 *
 * @param amountUsdCents - Amount in USD cents
 * @returns Amount in USDC raw units (bigint)
 */
export function usdCentsToRawUsdc(amountUsdCents: number): bigint {
  return BigInt(amountUsdCents) * 10_000n;
}

/**
 * Converts USDC raw units to USD cents
 * Inverse of usdCentsToRawUsdc
 *
 * @param amountRaw - Amount in USDC raw units
 * @returns Amount in USD cents
 */
export function rawUsdcToUsdCents(amountRaw: bigint): number {
  return Number(amountRaw / 10_000n);
}
