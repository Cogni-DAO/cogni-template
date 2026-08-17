// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/unit/features/governance/tokenomics-visuals`
 * Purpose: Verify token issuance and attribution-credit visual models remain exact and distinct.
 * Scope: Pure presentation derivation only. No React, wallet, chain, HTTP, time, or randomness.
 * Invariants: ISSUANCE_CONSERVATION, TOKENS_ARE_NOT_CREDITS, TOP_FIVE_PLUS_OTHER.
 * Side-effects: none
 * Links: src/features/governance/lib/tokenomics-visuals.ts
 * @internal
 */

import { describe, expect, it } from "vitest";

import {
  buildAttributionCreditBars,
  buildIssuanceSplit,
  formatCreditAmount,
} from "@/features/governance/lib/tokenomics-visuals";

describe("buildIssuanceSplit", () => {
  it("partitions issued supply exactly between distributor and elsewhere", () => {
    expect(buildIssuanceSplit(100n, 20n)).toEqual({
      kind: "available",
      totalSupply: 100n,
      distributorBalance: 20n,
      walletsElsewhereBalance: 80n,
      distributorPercent: 20,
      walletsElsewherePercent: 80,
    });
  });

  it("represents a real zero supply without fabricating a percentage", () => {
    expect(buildIssuanceSplit(0n, 0n)).toEqual({
      kind: "available",
      totalSupply: 0n,
      distributorBalance: 0n,
      walletsElsewhereBalance: 0n,
      distributorPercent: 0,
      walletsElsewherePercent: 0,
    });
  });

  it("waits for both reads and rejects an impossible cross-block split", () => {
    expect(buildIssuanceSplit(100n, undefined)).toBeNull();
    expect(buildIssuanceSplit(undefined, 20n)).toBeNull();
    expect(buildIssuanceSplit(100n, 101n)).toEqual({
      kind: "inconsistent",
      totalSupply: 100n,
      distributorBalance: 101n,
    });
  });

  it("keeps display percentages bounded for supplies above Number.MAX_SAFE_INTEGER", () => {
    const supply = 10n ** 30n;
    const split = buildIssuanceSplit(supply, supply / 3n);
    expect(split?.kind).toBe("available");
    if (split?.kind !== "available") return;
    expect(split.distributorPercent).toBe(33.33);
    expect(split.walletsElsewherePercent).toBe(66.67);
    expect(split.distributorBalance + split.walletsElsewhereBalance).toBe(
      supply
    );
  });
});

describe("buildAttributionCreditBars", () => {
  const holding = (key: string, credits: string, name = `Person ${key}`) => ({
    claimantKey: key,
    displayName: name,
    claimantLabel: "Contributor",
    totalCredits: credits,
  });

  it("returns no bars for an empty attribution ledger", () => {
    expect(buildAttributionCreditBars([])).toEqual([]);
  });

  it("ranks five named contributors and aggregates every remainder exactly", () => {
    const bars = buildAttributionCreditBars([
      holding("a", "60"),
      holding("b", "50"),
      holding("c", "40"),
      holding("d", "30"),
      holding("e", "20"),
      holding("f", "10"),
      holding("g", "5"),
    ]);

    expect(bars.map((bar) => bar.key)).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
      "other-contributors",
    ]);
    expect(bars.at(-1)).toMatchObject({
      label: "Other (2)",
      totalCredits: "15",
      isOther: true,
    });
    expect(bars.reduce((sum, bar) => sum + BigInt(bar.totalCredits), 0n)).toBe(
      215n
    );
  });

  it("uses claimant keys rather than duplicate display names as visual identity", () => {
    const bars = buildAttributionCreditBars([
      holding("wallet-a", "2", "Same name"),
      holding("wallet-b", "1", "Same name"),
    ]);

    expect(bars.map((bar) => bar.key)).toEqual(["wallet-a", "wallet-b"]);
    expect(new Set(bars.map((bar) => bar.key)).size).toBe(2);
  });

  it("formats credit counts without unsafe Number conversion", () => {
    expect(formatCreditAmount("900719925474099312345")).toBe(
      900719925474099312345n.toLocaleString()
    );
  });
});
