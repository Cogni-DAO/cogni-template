// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@adapters/server/compute/compute-dns-plan`
 * Purpose: Pure planning for per-lease compute DNS reconcile (task.5053) — decide WHICH
 *   CNAME records the compute lane may upsert/remove and what they point at, with zero IO.
 *   Sibling of akash-sdl.ts: the pure translator beside the IO adapter.
 * Scope: Hostname normalization, zone/lane eligibility, CNAME-target selection. Does NOT
 *   talk to Cloudflare (compute-dns.adapter.ts) or decide retry/error policy.
 * Invariants:
 *   - AKASH_LANE_ONLY: this lane owns exactly the `<slug>-akash` record class. Any host whose
 *     relative name does not end in `-akash` is skipped — flight-managed `<node>-<env>` records
 *     and everything else in the zone are untouchable from the compute path.
 *   - DNS_NEVER_TOUCHES_APEX: zone apex and `www` are refused here AND again by @cogni/dns-ops.
 *   - STABLE_ORIGIN (DEV2 finding, task.5049): a custom host in the SDL serves via the
 *     provider's SHARED ingress — routing is by Host header, not per-lease hostname. The CNAME
 *     target is therefore a stable Host-preserving origin when configured
 *     (AKASH_INGRESS_ORIGIN); the fallback is the lease's provider-generated endpoint, which
 *     the idempotent per-deploy reconcile re-points on every new lease.
 * Side-effects: none
 * Links: compute-dns.adapter.ts, .claude/skills/dns-ops/SKILL.md, scripts/ci/lib/cloudflare-dns.sh
 * @public
 */

/** Why a requested host was excluded from the reconcile plan. */
export type ComputeDnsSkipReason =
  | "foreign_zone" // not under the operator's Cloudflare zone — not ours to write
  | "not_akash_lane" // relative name doesn't end in `-akash` — another lane's record class
  | "protected" // zone apex / www — never touched programmatically
  | "no_target"; // no provider ingress endpoint (and no stable origin) to point at

/** One CNAME the compute lane intends to upsert. */
export interface PlannedCnameUpsert {
  /** Normalized FQDN of the custom host (e.g. `toks4-akash.cognidao.org`). */
  readonly host: string;
  /** Record name relative to the zone (e.g. `toks4-akash`). */
  readonly name: string;
  /** CNAME target — the Host-preserving provider ingress origin. */
  readonly target: string;
}

export interface SkippedHost {
  readonly host: string;
  readonly reason: ComputeDnsSkipReason;
}

export interface ComputeDnsUpsertPlan {
  readonly upserts: readonly PlannedCnameUpsert[];
  readonly skipped: readonly SkippedHost[];
}

/** The record class this lane owns: `<slug>-akash` (lane-ownership guard). */
const AKASH_LANE_NAME = /^[a-z0-9][a-z0-9-]*-akash$/;

/** Lowercase bare hostname: strips scheme, path, port, and trailing dot. */
export function normalizeHostname(input: string): string {
  let s = input.trim().toLowerCase();
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  s = s.split("/")[0] ?? s;
  s = s.split(":")[0] ?? s;
  return s.replace(/\.$/, "");
}

/**
 * Registrable zone root — last two labels, mirroring the fallback in
 * scripts/ci/lib/cloudflare-dns.sh `_cf_is_protected` (cognidao.org has no multi-part TLD).
 */
export function zoneRootOf(domain: string): string {
  const host = normalizeHostname(domain);
  const labels = host.split(".").filter(Boolean);
  if (labels.length < 2) return host;
  return labels.slice(-2).join(".");
}

/**
 * Select the Host-preserving CNAME origin for a lease: the configured stable origin wins
 * (STABLE_ORIGIN); else the first lease endpoint that is NOT one of the custom hosts
 * themselves (the provider-generated ingress hostname).
 */
export function selectProviderOrigin(input: {
  readonly endpoints: readonly string[];
  readonly hosts: readonly string[];
  readonly stableOrigin?: string | undefined;
}): string | undefined {
  if (input.stableOrigin) {
    const origin = normalizeHostname(input.stableOrigin);
    if (origin) return origin;
  }
  const customHosts = new Set(input.hosts.map(normalizeHostname));
  for (const endpoint of input.endpoints) {
    const host = normalizeHostname(endpoint);
    if (host.includes(".") && !customHosts.has(host)) return host;
  }
  return undefined;
}

/**
 * Plan the CNAME upserts for a freshly provisioned deployment. Pure: eligibility +
 * target selection only; the adapter owns idempotence (read-before-write) and IO.
 */
export function planComputeDnsUpserts(input: {
  /** Custom hosts requested in the deployment (SDL `accept` entries). */
  readonly hosts: readonly string[];
  /** Lease endpoints returned by the provider (uris; hostname or URL shaped). */
  readonly endpoints: readonly string[];
  /** Registrable Cloudflare zone root (e.g. `cognidao.org`). */
  readonly zone: string;
  /** Optional stable Host-preserving origin override (AKASH_INGRESS_ORIGIN). */
  readonly stableOrigin?: string | undefined;
}): ComputeDnsUpsertPlan {
  const zone = zoneRootOf(input.zone);
  const upserts: PlannedCnameUpsert[] = [];
  const skipped: SkippedHost[] = [];
  const target = selectProviderOrigin({
    endpoints: input.endpoints,
    hosts: input.hosts,
    stableOrigin: input.stableOrigin,
  });

  for (const raw of input.hosts) {
    const host = normalizeHostname(raw);
    if (!host) continue;
    if (host === zone || host === `www.${zone}`) {
      skipped.push({ host, reason: "protected" });
      continue;
    }
    if (!host.endsWith(`.${zone}`)) {
      skipped.push({ host, reason: "foreign_zone" });
      continue;
    }
    const name = host.slice(0, -(zone.length + 1));
    if (!AKASH_LANE_NAME.test(name)) {
      skipped.push({ host, reason: "not_akash_lane" });
      continue;
    }
    if (!target || target === host) {
      skipped.push({ host, reason: "no_target" });
      continue;
    }
    upserts.push({ host, name, target });
  }

  return { upserts, skipped };
}

/**
 * Plan the removal for a released deployment: exactly the node's `<slug>-akash` record
 * (the class this lane owns). Returns null when the slug cannot form a lane-owned name —
 * the caller must then skip rather than guess.
 */
export function planComputeDnsRemoval(input: {
  readonly slug: string;
  readonly zone: string;
}): { readonly name: string; readonly fqdn: string } | null {
  const zone = zoneRootOf(input.zone);
  const slug = normalizeHostname(input.slug);
  const name = `${slug}-akash`;
  if (!slug || !AKASH_LANE_NAME.test(name)) return null;
  return { name, fqdn: `${name}.${zone}` };
}
