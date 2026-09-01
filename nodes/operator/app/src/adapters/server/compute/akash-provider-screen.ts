// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@adapters/server/compute/akash-provider-screen`
 * Purpose: Pure bid-screening + provider-blacklist logic for the Akash provider quality
 *   mandate (task.5051): quality-filter bids on Console provider data, exclude implausibly
 *   cheap outliers, derive blacklist state from outcome history, and rank the survivors.
 * Scope: Pure functions over already-fetched data. Does NOT call the Console API, read the
 *   DB, or know about dseqs/leases (adapter's job) — separated so every transition is unit
 *   testable without IO.
 * Invariants:
 *   - AUDITED_ONLY: with provider metadata available, a bid survives only if its provider is
 *     audited + valid-version + online + uptime7d > 0.95 + activeLeases > 0 (active leases =
 *     proof of registry egress; marketplace uptime measures the status port, not workload
 *     success — froggy-servers failed 3/3 leases at "100%" uptime).
 *   - FAIL_OPEN_ON_MISSING_METADATA: an empty provider map (Console read failed) skips the
 *     metadata filter — the SDL `signedBy` audit anchor remains the hard gate on-chain.
 *   - PRICE_IS_TIEBREAK_NEVER_CRITERION: cheapest WITHIN the screened set; bids ~2σ below
 *     the median price are excluded (absurd underbids are a negative signal, the classic
 *     underbidding-zombie tell).
 *   - BLACKLIST_IS_DERIVED: 24h TTL per SLO failure, permanent at 3 strikes — computed from
 *     append-only outcome history, cleared by deleting rows (never stored state).
 * Side-effects: none (pure)
 * Links: ./akash-compute.adapter (caller), ./provider-outcome-store (history source),
 *   knowledge hub `akash-provider-quality-mandate`, task.5051, task.5049 (DEV2 findings)
 * @internal
 */

/** Provider quality signals read from Console `GET /v1/providers` (only what we screen on). */
export interface AkashProviderInfo {
  /** Provider account address (akash1…). */
  readonly owner: string;
  readonly isAudited: boolean;
  readonly isOnline: boolean;
  readonly isValidVersion: boolean;
  /** 7-day uptime ratio in [0,1]. */
  readonly uptime7d: number;
  /** Count of currently active leases (proof of registry egress). */
  readonly activeLeases: number;
  /** ISO 3166-1 alpha-2 country code of the provider's ingress IP, when known. */
  readonly countryCode: string | null;
}

/** One provider's aggregated boot-outcome history (from compute_provider_outcomes). */
export interface ProviderOutcomeStats {
  readonly successes: number;
  readonly failures: number;
  /** Epoch ms of the most recent SLO failure, or null when the provider never failed. */
  readonly lastFailureAtMs: number | null;
}

/** The screenable projection of one open bid. */
export interface ScreenableBid {
  /** Provider account address (akash1…). */
  readonly provider: string;
  /** Bid price per block in chain micro-units (lower = cheaper). */
  readonly priceAmount: number;
}

export interface ScreenBidsInput {
  readonly bids: readonly ScreenableBid[];
  /** Provider metadata keyed by owner address; EMPTY map = metadata unavailable (fail open). */
  readonly providers: ReadonlyMap<string, AkashProviderInfo>;
  /** Outcome history keyed by owner address; missing entry = no history. */
  readonly outcomes: ReadonlyMap<string, ProviderOutcomeStats>;
  /** Allowlisted providers (substrate-egress coupled); strongest preference, never a filter. */
  readonly preferredProviders: readonly string[];
  /** Country codes considered co-located with the env substrate (latency preference). */
  readonly preferredCountryCodes: readonly string[];
  /** Providers already tried (and failed) within the current provision attempt loop. */
  readonly excludedProviders: ReadonlySet<string>;
  readonly nowMs: number;
}

/** SLO-failure blacklist TTL: one recent failure sidelines a provider for 24h. */
export const BLACKLIST_TTL_MS = 24 * 60 * 60 * 1000;
/** Failures at which the blacklist becomes permanent (until history is manually cleared). */
export const BLACKLIST_PERMANENT_STRIKES = 3;
/** Minimum acceptable 7-day uptime ratio. */
export const MIN_UPTIME_7D = 0.95;
/** Bids more than this many standard deviations below the median price are excluded. */
const PRICE_OUTLIER_SIGMA = 2;

/**
 * Derived blacklist state: permanent at BLACKLIST_PERMANENT_STRIKES failures, else a
 * BLACKLIST_TTL_MS cooldown after the most recent failure.
 */
export function isProviderBlacklisted(
  stats: ProviderOutcomeStats | undefined,
  nowMs: number
): boolean {
  if (!stats) return false;
  if (stats.failures >= BLACKLIST_PERMANENT_STRIKES) return true;
  return (
    stats.lastFailureAtMs !== null &&
    nowMs - stats.lastFailureAtMs < BLACKLIST_TTL_MS
  );
}

/** True when the provider passes the practitioner quality filter (Console's own criteria). */
export function passesQualityFilter(info: AkashProviderInfo): boolean {
  return (
    info.isAudited &&
    info.isValidVersion &&
    info.isOnline &&
    info.uptime7d > MIN_UPTIME_7D &&
    info.activeLeases > 0
  );
}

/**
 * Providers whose bid price is implausibly cheap relative to the cohort (more than
 * PRICE_OUTLIER_SIGMA σ below the median). Needs ≥3 bids and price spread to fire.
 */
function priceOutlierProviders(
  bids: readonly ScreenableBid[]
): ReadonlySet<string> {
  if (bids.length < 3) return new Set();
  const prices = bids.map((b) => b.priceAmount).sort((a, b) => a - b);
  const mid = Math.floor(prices.length / 2);
  const median =
    prices.length % 2 === 0
      ? ((prices[mid - 1] ?? 0) + (prices[mid] ?? 0)) / 2
      : (prices[mid] ?? 0);
  const mean = prices.reduce((s, p) => s + p, 0) / prices.length;
  const sigma = Math.sqrt(
    prices.reduce((s, p) => s + (p - mean) ** 2, 0) / prices.length
  );
  if (sigma === 0) return new Set();
  const floor = median - PRICE_OUTLIER_SIGMA * sigma;
  return new Set(
    bids.filter((b) => b.priceAmount < floor).map((b) => b.provider)
  );
}

/**
 * Screen and rank open bids per the provider quality mandate. Returns surviving bids
 * best-first: allowlisted providers, then providers with proven own-history boot success,
 * then substrate-co-located providers (geography ≈ latency), price as the final tiebreak.
 */
export function screenBids(input: ScreenBidsInput): readonly ScreenableBid[] {
  const {
    bids,
    providers,
    outcomes,
    preferredProviders,
    preferredCountryCodes,
    excludedProviders,
    nowMs,
  } = input;

  const preferred = new Set(preferredProviders);
  const countries = new Set(preferredCountryCodes.map((c) => c.toUpperCase()));

  const eligible = bids.filter((bid) => {
    if (excludedProviders.has(bid.provider)) return false;
    if (isProviderBlacklisted(outcomes.get(bid.provider), nowMs)) return false;
    if (providers.size > 0) {
      const info = providers.get(bid.provider);
      // Unknown to the Console provider index while metadata IS available → not screenable.
      if (!info || !passesQualityFilter(info)) return false;
    }
    return true;
  });

  const outliers = priceOutlierProviders(eligible);
  const screened = eligible.filter((bid) => !outliers.has(bid.provider));

  const rank = (bid: ScreenableBid): readonly number[] => {
    const stats = outcomes.get(bid.provider);
    const info = providers.get(bid.provider);
    return [
      preferred.has(bid.provider) ? 0 : 1,
      stats && stats.successes > 0 ? 0 : 1,
      info?.countryCode && countries.has(info.countryCode.toUpperCase())
        ? 0
        : 1,
      bid.priceAmount,
    ];
  };

  return [...screened].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i++) {
      const d = (ra[i] ?? 0) - (rb[i] ?? 0);
      if (d !== 0) return d;
    }
    return 0;
  });
}
