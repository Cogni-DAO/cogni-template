// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@core/billing/pricing`
 * Purpose: Unit tests for pricing helpers.
 * Scope: Verifies usdToCredits and calculateUserPriceCredits. Does not test database integration.
 * Invariants: Conversion rates are deterministic; rounding is always up (ceil).
 * Side-effects: none
 * Links: `src/core/billing/pricing.ts`
 */

import { describe, expect, it, vi } from "vitest";
import {
  calculateUserPriceCredits,
  usdToCredits,
} from "@/core/billing/pricing";

// Mock serverEnv
vi.mock("@/shared/env", () => ({
  serverEnv: () => ({
    CREDITS_PER_USDC: 1000,
  }),
}));

describe("Pricing Logic", () => {
  // RATE is mocked to 1000

  describe("usdToCredits", () => {
    const CREDITS_PER_USDC = 1000;

    it("converts exact USD amounts to credits", () => {
      expect(usdToCredits(1.0, CREDITS_PER_USDC)).toBe(1000n);
      expect(usdToCredits(0.001, CREDITS_PER_USDC)).toBe(1n);
      expect(usdToCredits(0.000001, CREDITS_PER_USDC)).toBe(1n); // Minimum 1 credit
    });

    it("rounds up fractional credits", () => {
      // $0.0015 -> 1.5 credits -> 2 credits
      expect(usdToCredits(0.0015, CREDITS_PER_USDC)).toBe(2n); // 1.5 → 2
      expect(usdToCredits(0.0011, CREDITS_PER_USDC)).toBe(2n); // 1.1 → 2
    });

    it("handles zero cost", () => {
      expect(usdToCredits(0, CREDITS_PER_USDC)).toBe(0n);
    });
  });

  describe("calculateUserPriceCredits", () => {
    const MARKUP = 1.5; // 1.5x markup

    it("applies markup and rounds up", () => {
      // Cost: 1000 credits
      // Price: 1000 * 1.5 = 1500 credits
      expect(calculateUserPriceCredits(1000n, MARKUP)).toBe(1500n);
    });

    it("ensures user price is at least provider cost (profit margin)", () => {
      // Cost: 1 credit
      // Price: 1 * 1.5 = 1.5 -> 2 credits
      expect(calculateUserPriceCredits(1n, MARKUP)).toBe(2n);
    });

    it("handles small costs correctly", () => {
      // Cost: 1 credit
      // Price: 1 * 1.5 = 1.5 -> 2 credits
      expect(calculateUserPriceCredits(1n, MARKUP)).toBe(2n);
    });

    it("always results in price >= cost", () => {
      const inputs = [1n, 10n, 100n, 1000n, 10000n];
      inputs.forEach((cost) => {
        const userCredits = calculateUserPriceCredits(cost, MARKUP);
        expect(userCredits).toBeGreaterThanOrEqual(cost);
      });
    });

    it("handles zero cost", () => {
      expect(calculateUserPriceCredits(0n, MARKUP)).toBe(0n);
    });
  });
});
