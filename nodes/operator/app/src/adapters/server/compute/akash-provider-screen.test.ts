// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

import { describe, expect, it } from "vitest";
import {
  type AkashProviderInfo,
  BLACKLIST_TTL_MS,
  isProviderBlacklisted,
  type ProviderOutcomeStats,
  passesQualityFilter,
  type ScreenableBid,
  screenBids,
} from "./akash-provider-screen";

const NOW = 1_788_000_000_000;
const HOUR = 60 * 60 * 1000;

function info(
  owner: string,
  over: Partial<AkashProviderInfo> = {}
): AkashProviderInfo {
  return {
    owner,
    isAudited: true,
    isOnline: true,
    isValidVersion: true,
    uptime7d: 0.999,
    activeLeases: 5,
    countryCode: "BE",
    ...over,
  };
}

function bid(provider: string, priceAmount: number): ScreenableBid {
  return { provider, priceAmount };
}

function screen(
  bids: ScreenableBid[],
  over: Partial<Parameters<typeof screenBids>[0]> = {}
): readonly ScreenableBid[] {
  return screenBids({
    bids,
    providers: new Map(),
    outcomes: new Map(),
    preferredProviders: [],
    preferredCountryCodes: [],
    excludedProviders: new Set(),
    nowMs: NOW,
    ...over,
  });
}

describe("passesQualityFilter", () => {
  it("accepts an audited online valid-version provider with uptime and active leases", () => {
    expect(passesQualityFilter(info("akash1good"))).toBe(true);
  });

  it.each([
    ["unaudited", { isAudited: false }],
    ["offline", { isOnline: false }],
    ["invalid version", { isValidVersion: false }],
    ["uptime7d at threshold", { uptime7d: 0.95 }],
    ["zero active leases", { activeLeases: 0 }],
  ] as const)("rejects a provider that is %s", (_label, over) => {
    expect(passesQualityFilter(info("akash1bad", over))).toBe(false);
  });
});

describe("isProviderBlacklisted", () => {
  const stats = (
    over: Partial<ProviderOutcomeStats>
  ): ProviderOutcomeStats => ({
    successes: 0,
    failures: 0,
    lastFailureAtMs: null,
    ...over,
  });

  it("no history → not blacklisted", () => {
    expect(isProviderBlacklisted(undefined, NOW)).toBe(false);
    expect(isProviderBlacklisted(stats({}), NOW)).toBe(false);
  });

  it("a failure within 24h → blacklisted (TTL)", () => {
    expect(
      isProviderBlacklisted(
        stats({ failures: 1, lastFailureAtMs: NOW - HOUR }),
        NOW
      )
    ).toBe(true);
  });

  it("a failure older than 24h → cooldown expired", () => {
    expect(
      isProviderBlacklisted(
        stats({ failures: 1, lastFailureAtMs: NOW - BLACKLIST_TTL_MS - 1 }),
        NOW
      )
    ).toBe(false);
  });

  it("3 strikes → permanent even when the last failure is old", () => {
    expect(
      isProviderBlacklisted(
        stats({ failures: 3, lastFailureAtMs: NOW - 30 * 24 * HOUR }),
        NOW
      )
    ).toBe(true);
  });
});

describe("screenBids quality filter", () => {
  it("drops providers failing the quality filter when metadata is available", () => {
    const providers = new Map([
      ["akash1good", info("akash1good")],
      ["akash1froggy", info("akash1froggy", { activeLeases: 0 })],
      ["akash1down", info("akash1down", { isOnline: false })],
    ]);
    const out = screen(
      [bid("akash1froggy", 10), bid("akash1good", 500), bid("akash1down", 20)],
      { providers }
    );
    expect(out.map((b) => b.provider)).toEqual(["akash1good"]);
  });

  it("drops providers unknown to the metadata index when metadata is available", () => {
    const providers = new Map([["akash1known", info("akash1known")]]);
    const out = screen([bid("akash1known", 500), bid("akash1ghost", 10)], {
      providers,
    });
    expect(out.map((b) => b.provider)).toEqual(["akash1known"]);
  });

  it("fails open (keeps all bidders) when provider metadata is unavailable", () => {
    const out = screen([bid("akash1a", 200), bid("akash1b", 100)]);
    expect(out.map((b) => b.provider)).toEqual(["akash1b", "akash1a"]);
  });
});

describe("screenBids blacklist + exclusions", () => {
  it("drops blacklisted providers", () => {
    const outcomes = new Map([
      [
        "akash1struck",
        { successes: 0, failures: 1, lastFailureAtMs: NOW - HOUR },
      ],
    ]);
    const out = screen([bid("akash1struck", 10), bid("akash1clean", 500)], {
      outcomes,
    });
    expect(out.map((b) => b.provider)).toEqual(["akash1clean"]);
  });

  it("drops providers already tried in this provision loop", () => {
    const out = screen([bid("akash1tried", 10), bid("akash1fresh", 500)], {
      excludedProviders: new Set(["akash1tried"]),
    });
    expect(out.map((b) => b.provider)).toEqual(["akash1fresh"]);
  });
});

describe("screenBids price-outlier exclusion", () => {
  it("drops a bid implausibly far below the median price", () => {
    const out = screen([
      bid("akash1a", 100),
      bid("akash1b", 100),
      bid("akash1c", 100),
      bid("akash1d", 100),
      bid("akash1zombie", 5),
    ]);
    expect(out.map((b) => b.provider)).not.toContain("akash1zombie");
    expect(out).toHaveLength(4);
  });

  it("keeps cheap-but-plausible bids (needs spread and cohort size to fire)", () => {
    expect(screen([bid("akash1a", 5), bid("akash1b", 100)])).toHaveLength(2);
    expect(
      screen([bid("akash1a", 100), bid("akash1b", 100), bid("akash1c", 100)])
    ).toHaveLength(3);
  });
});

describe("screenBids ranking", () => {
  it("prefers an allowlisted provider over a cheaper stranger", () => {
    const out = screen([bid("akash1zen", 900), bid("akash1cheap", 100)], {
      preferredProviders: ["akash1zen"],
    });
    expect(out[0]?.provider).toBe("akash1zen");
  });

  it("prefers a provider with proven boot history over a cheaper unknown", () => {
    const outcomes = new Map([
      ["akash1proven", { successes: 3, failures: 0, lastFailureAtMs: null }],
    ]);
    const out = screen([bid("akash1proven", 900), bid("akash1cheap", 100)], {
      outcomes,
    });
    expect(out[0]?.provider).toBe("akash1proven");
  });

  it("prefers a substrate-co-located provider over a cheaper distant one", () => {
    const providers = new Map([
      ["akash1near", info("akash1near", { countryCode: "LT" })],
      ["akash1far", info("akash1far", { countryCode: "US" })],
    ]);
    const out = screen([bid("akash1near", 900), bid("akash1far", 100)], {
      providers,
      preferredCountryCodes: ["LT", "DE"],
    });
    expect(out[0]?.provider).toBe("akash1near");
  });

  it("breaks ties on price within the same tier", () => {
    const out = screen([bid("akash1pricier", 500), bid("akash1cheaper", 100)]);
    expect(out.map((b) => b.provider)).toEqual([
      "akash1cheaper",
      "akash1pricier",
    ]);
  });

  it("allowlist outranks history, which outranks geography", () => {
    const providers = new Map([
      ["akash1pref", info("akash1pref", { countryCode: "US" })],
      ["akash1hist", info("akash1hist", { countryCode: "US" })],
      ["akash1near", info("akash1near", { countryCode: "LT" })],
    ]);
    const outcomes = new Map([
      ["akash1hist", { successes: 2, failures: 0, lastFailureAtMs: null }],
    ]);
    const out = screen(
      [bid("akash1near", 10), bid("akash1hist", 20), bid("akash1pref", 30)],
      {
        providers,
        outcomes,
        preferredProviders: ["akash1pref"],
        preferredCountryCodes: ["LT"],
      }
    );
    expect(out.map((b) => b.provider)).toEqual([
      "akash1pref",
      "akash1hist",
      "akash1near",
    ]);
  });
});
