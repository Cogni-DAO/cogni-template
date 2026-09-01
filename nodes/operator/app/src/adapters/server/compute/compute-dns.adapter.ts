// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@adapters/server/compute/compute-dns.adapter`
 * Purpose: Per-lease compute DNS reconcile (task.5053, story.5016 slice 2) — upsert each custom
 *   `<slug>-akash` host's CNAME to the lease's provider ingress on deploy, and prune it on
 *   release. Replaces the last hand Cloudflare PATCH in the Akash deploy loop.
 * Scope: IO executor over @cogni/dns-ops for the plan computed by compute-dns-plan.ts. Does NOT
 *   fail a deployment/release on DNS trouble — it reports a structured result the route surfaces.
 * Invariants:
 *   - NEVER_THROWS: DNS is best-effort follow-through on an already-spent lease action; every
 *     failure is contained into `{status:"error"}` so the workload result still reaches the caller.
 *   - IDEMPOTENT_UPSERT: read-before-write — an existing CNAME already at the target is left
 *     untouched (`unchanged`), mirroring the noop contract of scripts/ci/lib/cloudflare-dns.sh.
 *   - LANE_OWNERSHIP: only the plan's `<slug>-akash` class is ever written or removed; removal is
 *     additionally CNAME-typed so a same-name A record (another lane's) can never be deleted.
 *   - PROTECTED_RECORDS: apex/www refused by the plan AND by @cogni/dns-ops assertNotProtected.
 *   - GRACEFUL_DEGRADATION: without CLOUDFLARE_API_TOKEN/CLOUDFLARE_ZONE_ID (or a base domain)
 *     every call reports `{status:"skipped", reason:"dns_unconfigured"}` — same contract as the
 *     unconfigured compute providers.
 * Side-effects: IO (Cloudflare DNS API via @cogni/dns-ops)
 * Links: compute-dns-plan.ts, @cogni/dns-ops, .claude/skills/dns-ops/SKILL.md,
 *   app/api/v1/compute/deployments/route.ts, app/api/v1/compute/deployments/[leaseId]/route.ts
 * @public
 */

import {
  CloudflareAdapter,
  type DnsRecord,
  type DomainRegistrarPort,
  removeDnsRecord,
  type TargetedDnsPort,
  upsertDnsRecord,
} from "@cogni/dns-ops";

import {
  type ComputeDnsUpsertPlan,
  normalizeHostname,
  planComputeDnsRemoval,
  planComputeDnsUpserts,
  type SkippedHost,
} from "./compute-dns-plan";

export type { ComputeDnsSkipReason, SkippedHost } from "./compute-dns-plan";

/** TTL matching the CI writer (scripts/ci/lib/cloudflare-dns.sh). */
const CNAME_TTL_SECONDS = 300;

export interface ComputeDnsReconcilerConfig {
  /** Registrable Cloudflare zone root (e.g. `cognidao.org`). Empty → reconcile disabled. */
  zone: string;
  /** Cloudflare Zone·DNS·Edit token. Absent → reconcile disabled. */
  apiToken?: string | undefined;
  /** Cloudflare zone ID. Absent → reconcile disabled. */
  zoneId?: string | undefined;
  /** Stable Host-preserving CNAME origin override (AKASH_INGRESS_ORIGIN, DEV2 finding). */
  stableOrigin?: string | undefined;
  /** Test seam: injected registrar wins over CloudflareAdapter construction. */
  registrar?: (DomainRegistrarPort & Partial<TargetedDnsPort>) | undefined;
}

export type ComputeDnsRecordAction =
  | "created"
  | "updated"
  | "unchanged"
  | "removed";

export interface ComputeDnsRecordResult {
  readonly host: string;
  readonly target?: string;
  readonly action: ComputeDnsRecordAction;
}

/** Structured outcome the compute routes surface in their JSON response. */
export interface ComputeDnsReconcileResult {
  readonly status: "reconciled" | "skipped" | "error";
  readonly reason?: string;
  readonly records?: readonly ComputeDnsRecordResult[];
  readonly skipped?: readonly SkippedHost[];
}

export class ComputeDnsReconciler {
  private readonly zone: string;
  private readonly stableOrigin: string | undefined;
  private readonly registrar:
    | (DomainRegistrarPort & Partial<TargetedDnsPort>)
    | undefined;

  constructor(config: ComputeDnsReconcilerConfig) {
    this.zone = config.zone;
    this.stableOrigin = config.stableOrigin;
    this.registrar =
      config.registrar ??
      (config.apiToken && config.zoneId
        ? new CloudflareAdapter({
            apiToken: config.apiToken,
            zoneId: config.zoneId,
          })
        : undefined);
  }

  /** True when a registrar + zone are configured (CLOUDFLARE_* materialized). */
  get enabled(): boolean {
    return this.registrar !== undefined && this.zone.length > 0;
  }

  /**
   * After a successful provision: upsert each eligible custom host's CNAME to the lease's
   * Host-preserving provider ingress origin. Never throws (NEVER_THROWS).
   */
  async reconcileDeploy(input: {
    hosts: readonly string[];
    endpoints: readonly string[];
  }): Promise<ComputeDnsReconcileResult> {
    if (!this.enabled || !this.registrar) {
      return { status: "skipped", reason: "dns_unconfigured" };
    }
    let plan: ComputeDnsUpsertPlan;
    try {
      plan = planComputeDnsUpserts({
        hosts: input.hosts,
        endpoints: input.endpoints,
        zone: this.zone,
        stableOrigin: this.stableOrigin,
      });
    } catch (err) {
      return { status: "error", reason: errorMessage(err) };
    }
    if (plan.upserts.length === 0) {
      return {
        status: "skipped",
        reason: "no_eligible_hosts",
        skipped: plan.skipped,
      };
    }

    const records: ComputeDnsRecordResult[] = [];
    const failures: string[] = [];
    for (const upsert of plan.upserts) {
      try {
        const action = await this.upsertCname(this.registrar, upsert);
        records.push({ host: upsert.host, target: upsert.target, action });
      } catch (err) {
        failures.push(`${upsert.host}: ${errorMessage(err)}`);
      }
    }
    if (failures.length > 0) {
      return {
        status: "error",
        reason: failures.join("; "),
        records,
        skipped: plan.skipped,
      };
    }
    return { status: "reconciled", records, skipped: plan.skipped };
  }

  /**
   * After a release: prune the node's `<slug>-akash` CNAME (the one record class this lane
   * owns — LANE_OWNERSHIP). Removal is CNAME-typed and a no-op when absent. Never throws.
   */
  async reconcileRelease(input: {
    slug: string;
  }): Promise<ComputeDnsReconcileResult> {
    if (!this.enabled || !this.registrar) {
      return { status: "skipped", reason: "dns_unconfigured" };
    }
    const removal = planComputeDnsRemoval({
      slug: input.slug,
      zone: this.zone,
    });
    if (!removal) {
      return { status: "skipped", reason: "ineligible_slug" };
    }
    try {
      await removeDnsRecord(this.registrar, this.zone, removal.name, "CNAME");
      return {
        status: "reconciled",
        records: [{ host: removal.fqdn, action: "removed" }],
      };
    } catch (err) {
      return { status: "error", reason: errorMessage(err) };
    }
  }

  /** IDEMPOTENT_UPSERT: skip the write when exactly one CNAME already matches the target. */
  private async upsertCname(
    registrar: DomainRegistrarPort & Partial<TargetedDnsPort>,
    upsert: { host: string; name: string; target: string }
  ): Promise<ComputeDnsRecordAction> {
    let existing: DnsRecord[] = [];
    if (typeof registrar.findRecords === "function") {
      existing = await registrar.findRecords(upsert.host, "CNAME");
    }
    const first = existing[0];
    if (
      existing.length === 1 &&
      first &&
      normalizeHostname(first.value) === upsert.target &&
      first.proxied !== true
    ) {
      return "unchanged";
    }
    await upsertDnsRecord(registrar, this.zone, {
      name: upsert.name,
      type: "CNAME",
      value: upsert.target,
      ttl: CNAME_TTL_SECONDS,
      proxied: false,
    });
    return existing.length > 0 ? "updated" : "created";
  }
}

/** Error → message without echoing raw response bodies. */
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
