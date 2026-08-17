// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `open-epoch-review.test`
 * Purpose: Prove the UI only offers the open-to-review transition after an open epoch ends.
 * Scope: Pure eligibility boundary tests; route authorization remains covered by the route contract suite.
 * Invariants: REVIEW_ONLY_AFTER_PERIOD_END, REVIEW_ONLY_FROM_OPEN.
 * Side-effects: none
 * Links: src/features/governance/hooks/useOpenEpochReview.ts, work item bug.5042
 * @public
 */

import { describe, expect, it } from "vitest";

import { isEpochReadyForReview } from "@/features/governance/hooks/useOpenEpochReview";

const END = "2026-08-17T00:00:00.000Z";
const END_MS = Date.parse(END);

describe("isEpochReadyForReview", () => {
  it("opens at the exact period boundary", () => {
    expect(isEpochReadyForReview("open", END, END_MS)).toBe(true);
  });

  it("stays unavailable before the period boundary", () => {
    expect(isEpochReadyForReview("open", END, END_MS - 1)).toBe(false);
  });

  it.each([
    "review",
    "finalized",
  ] as const)("does not offer the transition from %s", (status) => {
    expect(isEpochReadyForReview(status, END, END_MS + 1)).toBe(false);
  });

  it("fails closed for an invalid period end", () => {
    expect(isEpochReadyForReview("open", "not-a-date", END_MS)).toBe(false);
  });
});
