// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@bootstrap/capabilities/compute-dns`
 * Purpose: Factory for the per-lease compute DNS reconciler (task.5053) — derives the
 *   Cloudflare zone root from the env base domain and wires the Cloudflare credential.
 * Scope: Construction only; behavior lives in ComputeDnsReconciler + compute-dns-plan.
 * Invariants:
 *   - NO_SECRETS_IN_CONTEXT: CLOUDFLARE_API_TOKEN/CLOUDFLARE_ZONE_ID resolved from env here,
 *     never passed to tools.
 *   - GRACEFUL_DEGRADATION: missing credential or base domain → the reconciler reports
 *     `dns_unconfigured` and every compute deploy/release proceeds without DNS writes.
 * Side-effects: none (factory only)
 * Links: adapters/server/compute/compute-dns.adapter.ts, .claude/commands/env-update.md
 * @internal
 */

import { ComputeDnsReconciler, zoneRootOf } from "@/adapters/server";
import type { ServerEnv } from "@/shared/env";
import { baseDomain } from "@/shared/node-registry/resolve";

/** Create the per-lease compute DNS reconciler from server environment. */
export function createComputeDnsReconciler(
  env: ServerEnv
): ComputeDnsReconciler {
  const domain = baseDomain({
    DOMAIN: env.DOMAIN,
    APP_BASE_URL: env.APP_BASE_URL,
  });
  return new ComputeDnsReconciler({
    zone: domain ? zoneRootOf(domain) : "",
    apiToken: env.CLOUDFLARE_API_TOKEN,
    zoneId: env.CLOUDFLARE_ZONE_ID,
    stableOrigin: env.AKASH_INGRESS_ORIGIN,
  });
}
