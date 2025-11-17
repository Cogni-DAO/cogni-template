// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@core/billing/pricing`
 * Purpose: Centralized credit pricing helpers for LLM usage.
 * Scope: Pure functions that convert token usage to credit costs. Does not access adapters or IO.
 * Invariants: Deterministic cost calculation, no floating-point surprises.
 * Side-effects: none
 * Notes: Keeps pricing logic in one place so adapters/features stay in sync.
 * Links: Used by AI completion feature to debit credits after usage.
 * @public
 */

// 1 credit per 1k tokens
const DEFAULT_RATE_PER_TOKEN = 0.001;
// Never charge less than a cent-credit for non-zero usage
const MINIMUM_CHARGE = 0.01;

export interface PricingInput {
  modelId?: string;
  totalTokens: number;
}

/**
 * Calculate credit cost for a completion
 * @param params - model identifier + total token usage
 */
export function calculateCost(params: PricingInput): number {
  const tokens = Math.max(0, params.totalTokens);
  if (tokens === 0) {
    return MINIMUM_CHARGE;
  }

  const raw = tokens * DEFAULT_RATE_PER_TOKEN;
  const rounded = Number(raw.toFixed(2));
  return Math.max(rounded, MINIMUM_CHARGE);
}
