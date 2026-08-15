// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/governance/lib/format-token-amount`
 * Purpose: Display formatter for 18-decimal base-unit token amounts on the Ownership page.
 * Scope: Pure presentation helper. Does not perform token math, IO, or DB access. Mirrors the
 *   18-decimal semantics used by CumulativeClaimPanel — amounts stay bigint until this display seam.
 * Invariants:
 *   - ALL_MATH_BIGINT: input is a bigint in base ERC20 units (18 decimals); no float math on values.
 *   - DISPLAY_ONLY: returns a human string; never used for on-chain comparisons.
 * Side-effects: none
 * Links: nodes/operator/app/src/features/governance/components/CumulativeClaimPanel.tsx
 * @public
 */

const DECIMALS = 18n;
const DIVISOR = 10n ** DECIMALS;

/**
 * Format an 18-decimal base-unit amount, trimming trailing fractional zeros to 4 places.
 * `suffix` is appended (e.g. " tokens"); pass "" for a bare number.
 */
export function formatTokenAmount(base: bigint, suffix = " tokens"): string {
  const whole = base / DIVISOR;
  const frac = base % DIVISOR;
  if (frac === 0n) return `${whole.toLocaleString()}${suffix}`;
  const fracStr = frac.toString().padStart(18, "0").replace(/0+$/, "");
  return `${whole.toLocaleString()}.${fracStr.slice(0, 4)}${suffix}`;
}

/** Shorten an EVM address for display: 0x1234…abcd. */
export function shortenAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
