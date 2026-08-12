// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@bootstrap/jobs/resolveRoutableNodeGovernanceConfigs`
 * Purpose: Read every routable node's git-authoritative governance config (schedules +
 *   synthesized LEDGER_INGEST) so the operator can sync each node's per-node epoch-collect
 *   NodeTaskWorkflow dispatch — not merely route its receipts. (story.5001 — multi-node epochs.)
 * Scope: Enumerates `('published','active')` nodes (service-role, non-RLS) and App-reads each
 *   node's own `.cogni/repo-spec.yaml` via the deploy plane (SPECS_GIT_AUTHORITATIVE — never a DB
 *   projection). Extracts the full GovernanceConfig. Does NOT create schedules or touch Temporal —
 *   the caller (`syncGovernanceSchedules.job`) does that per node.
 * Invariants:
 *   - MULTI_NODE_GOVERNANCE: one config per routable node, read from its OWN repo-spec.
 *   - SPECS_GIT_AUTHORITATIVE: repo-spec is read from git (App-auth), never from a DB projection.
 *   - FAIL_SOFT_PER_NODE: a single node's read/parse failure is swallowed to a warn — it never
 *     blocks a sibling node's config from being returned.
 *   - SKIP_EMPTY: a node with neither an `activity_ledger` nor declared schedules yields nothing.
 * Side-effects: IO (service-DB read of `nodes`; GitHub App file reads via the deploy plane).
 * Links: nodes/operator/app/src/bootstrap/container.ts (resolveServiceDb, createOperatorDeployPlane,
 *   resolveAttributionProfileResolver — the sibling per-node read this mirrors),
 *   packages/scheduler-core/src/services/syncGovernanceSchedules.ts, docs/spec/substrate-temporal.md
 * @public
 */

import {
  extractGovernanceConfig,
  type GovernanceConfig,
  parseRepoSpec,
} from "@cogni/repo-spec";
import { inArray } from "drizzle-orm";
import { createOperatorDeployPlane } from "@/bootstrap/capabilities/operator-deploy-plane";
import { getContainer, resolveServiceDb } from "@/bootstrap/container";
import { nodes } from "@/shared/db/nodes";
import { serverEnv } from "@/shared/env/server-env";

/**
 * Statuses a node must be in to receive epoch-collect dispatch. Mirrors the container's
 * `ROUTABLE_NODE_STATUSES` (git-attribution routing): a node is `published` (repo-spec +
 * catalog exist) well before `active`, and both should collect from their declared repos.
 */
const ROUTABLE_NODE_STATUSES = ["published", "active"] as const;

/** A routable node's git-authoritative governance config + identity. */
export interface RoutableNodeGovernanceConfig {
  nodeId: string;
  slug: string;
  config: GovernanceConfig;
}

/**
 * List every node eligible for epoch-collect routing — service-role (non-RLS) read of
 * `{id, slug}` for nodes in `('published','active')`. Local copy of the container's private
 * `listRoutableNodes` (same query) so this module stays standalone (a sibling PR edits
 * container.ts; MINIMIZE_CONTAINER_EDITS).
 */
async function listRoutableNodes(): Promise<{ id: string; slug: string }[]> {
  return resolveServiceDb()
    .select({ id: nodes.id, slug: nodes.slug })
    .from(nodes)
    .where(inArray(nodes.status, [...ROUTABLE_NODE_STATUSES]));
}

/**
 * MULTI_NODE_GOVERNANCE: read every routable node's git-authoritative governance config
 * (its OWN `.cogni/repo-spec.yaml`, App-read via the deploy plane). Mirrors the
 * attribution-profile resolver's per-node read (same `listRoutableNodes` + plane), but
 * extracts the full {@link GovernanceConfig} (schedules + synthesized LEDGER_INGEST) instead
 * of only `source_refs` — so the operator can sync each node's collect schedule, not merely
 * route its receipts. A node with neither an `activity_ledger` nor declared schedules yields
 * nothing and is skipped. Every per-node failure is swallowed to a warn (a bad node never
 * blocks a sibling).
 */
export async function resolveRoutableNodeGovernanceConfigs(): Promise<
  RoutableNodeGovernanceConfig[]
> {
  const env = serverEnv();
  const plane = createOperatorDeployPlane(env);
  const parentOwner = env.NODE_SUBMODULE_PARENT_OWNER ?? "";
  const parentRepo = env.NODE_SUBMODULE_PARENT_REPO ?? "";
  const { log } = getContainer();

  const routable = await listRoutableNodes();
  const settled = await Promise.allSettled(
    routable.map(async (node) => {
      const repo = await plane.resolveNodeRepo({
        parentOwner,
        parentRepo,
        slug: node.slug,
      });
      const isInRepo =
        repo.owner.toLowerCase() === parentOwner.toLowerCase() &&
        repo.repo.toLowerCase() === parentRepo.toLowerCase();
      const specText = await plane.fetchFileText({
        owner: repo.owner,
        repo: repo.repo,
        path: isInRepo
          ? `nodes/${node.slug}/.cogni/repo-spec.yaml`
          : ".cogni/repo-spec.yaml",
        ref: "main",
      });
      if (specText === null) return null;
      const config = extractGovernanceConfig(parseRepoSpec(specText));
      // Only nodes that actually declare epochs (ledger) or governance schedules
      // get synced — skip the rest so we never create empty schedule shells.
      if (!config.ledger && config.schedules.length === 0) return null;
      return { nodeId: node.id, slug: node.slug, config };
    })
  );

  const out: RoutableNodeGovernanceConfig[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled" && r.value !== null) {
      out.push(r.value);
    } else if (r.status === "rejected") {
      log.warn(
        {
          event: "governance.node_config_skipped",
          err: String(r.reason),
        },
        "skipped a routable node's governance config (read/parse failed)"
      );
    }
  }
  return out;
}
