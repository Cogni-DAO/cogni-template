// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/nodes/node-distribution-config`
 * Purpose: Resolve a node's DISTRIBUTION config (token, emissions holder, distributor, chain)
 *   from that node's OWN `.cogni/repo-spec.yaml` — the git-authoritative read the R3 finalize
 *   fold delegates here (SPECS_GIT_AUTHORITATIVE; the ledger worker holds no GitHub credential
 *   per bug.5000, so it asks the operator gateway instead of fetching GitHub itself).
 * Scope: Composition of injected deps — registry lookup (nodeId → slug), App-read of the node's
 *   catalog repo + repo-spec, parse with `@cogni/repo-spec`, extract via
 *   `extractDaoTokenDistributionConfig` (gated on `distributions.status === "active"`) +
 *   `extractDistributorAddress`. No DB/env/octokit here — all injected. Reuses the exact fetch
 *   deps of `attribution-profile-resolver` (same deploy-plane plumbing, no new fetch path).
 * Invariants:
 *   - SPECS_GIT_AUTHORITATIVE: config values come from the node's repo-spec at git HEAD, never env.
 *   - INACTIVE_IS_NULL_NOT_ERROR: a node without `distributions.status: active` (or with a
 *     permanently unresolvable spec: unregistered node, missing catalog, missing/invalid spec)
 *     resolves to `distribution: null` with a `reason` — the finalize fold no-ops.
 *   - TRANSIENT_IS_ERROR_NOT_NULL: transient fetch failures (registry read, App-read) throw
 *     `DistributionSpecUnavailableError` so callers surface 503 and the worker retries/falls back —
 *     a network blip must never masquerade as "distributions inactive".
 * Side-effects: none directly (injected deps do the I/O)
 * Links: src/features/nodes/attribution-profile-resolver.ts (fetch-dep twins),
 *   packages/repo-spec/src/accessors.ts, services/scheduler-worker/src/activities/ledger.ts,
 *   src/app/api/internal/attribution/distribution-config/route.ts (consumer), bug.5020
 * @internal
 */

import {
  extractChainId,
  extractDaoTokenDistributionConfig,
  extractDistributorAddress,
  parseRepoSpec,
} from "@cogni/repo-spec";
import type { Logger } from "pino";

import type {
  ResolvedNodeRepo,
  RoutableNode,
} from "@/features/nodes/attribution-profile-resolver";
import { makeLogger } from "@/shared/observability";

/** Distribution config resolved from a node's repo-spec (all git-authoritative). */
export interface NodeDistributionConfig {
  readonly chainId: number;
  readonly tokenAddress: string;
  readonly emissionsHolderAddress: string;
  readonly distributorAddress: string | null;
}

/** Resolution result — `distribution: null` ⇔ not activated / permanently unresolvable. */
export interface ResolvedNodeDistribution {
  readonly nodeId: string;
  readonly distribution: NodeDistributionConfig | null;
  readonly reason?: string;
}

/**
 * Transient failure fetching the node's spec (registry or App-read). Callers map
 * this to 503 so the worker can retry or fall back — never to a silent no-op.
 */
export class DistributionSpecUnavailableError extends Error {
  readonly retryable = true as const;
  constructor(nodeId: string, cause: unknown) {
    super(
      `distribution-config spec read unavailable for node ${nodeId}: ${String(cause)}`
    );
    this.name = "DistributionSpecUnavailableError";
  }
}

export interface NodeDistributionConfigResolverDeps {
  /** Nodes eligible for resolution (status ∈ {published, active}) — registry read. */
  readonly listRoutableNodes: () => Promise<readonly RoutableNode[]>;
  /** App-read `infra/catalog/<slug>.yaml` → the node's REAL `{owner, repo}`. */
  readonly resolveNodeRepo: (slug: string) => Promise<ResolvedNodeRepo>;
  /** App-read the node's `.cogni/repo-spec.yaml` (path discriminated by isInRepo). */
  readonly fetchRepoSpecText: (input: {
    owner: string;
    repo: string;
    isInRepo: boolean;
    slug: string;
  }) => Promise<string | null>;
  /** The deployment parent monorepo — discriminates in-repo nodes from forks. */
  readonly parentOwner: string;
  readonly parentRepo: string;
  readonly log?: Logger;
}

export interface NodeDistributionConfigResolver {
  /**
   * Resolve the distribution config for ONE node from its repo-spec.
   * @throws DistributionSpecUnavailableError on transient fetch failure.
   */
  resolveForNode(nodeId: string): Promise<ResolvedNodeDistribution>;
}

const inactive = (
  nodeId: string,
  reason: string
): ResolvedNodeDistribution => ({
  nodeId,
  distribution: null,
  reason,
});

export function createNodeDistributionConfigResolver(
  deps: NodeDistributionConfigResolverDeps
): NodeDistributionConfigResolver {
  const log = deps.log ?? makeLogger({ component: "node-distribution-config" });

  return {
    async resolveForNode(nodeId: string): Promise<ResolvedNodeDistribution> {
      // 1. Registry: nodeId → slug. A registry outage is transient, not "inactive".
      let nodes: readonly RoutableNode[];
      try {
        nodes = await deps.listRoutableNodes();
      } catch (err) {
        throw new DistributionSpecUnavailableError(nodeId, err);
      }
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) {
        return inactive(nodeId, "node_not_registered");
      }

      // 2. Catalog: slug → real {owner, repo}. A missing catalog is a permanent
      //    pre-publish state (profile resolver treats it the same); anything else
      //    from the deploy plane is treated as transient.
      let repo: ResolvedNodeRepo;
      try {
        repo = await deps.resolveNodeRepo(node.slug);
      } catch (err) {
        if ((err as { code?: string })?.code === "catalog_missing") {
          return inactive(nodeId, "catalog_missing");
        }
        throw new DistributionSpecUnavailableError(nodeId, err);
      }

      const isInRepo =
        repo.owner.toLowerCase() === deps.parentOwner.toLowerCase() &&
        repo.repo.toLowerCase() === deps.parentRepo.toLowerCase();

      // 3. App-read the node's repo-spec. Absent spec = permanent (not activated);
      //    fetch failure = transient.
      let specText: string | null;
      try {
        specText = await deps.fetchRepoSpecText({
          owner: repo.owner,
          repo: repo.repo,
          isInRepo,
          slug: node.slug,
        });
      } catch (err) {
        throw new DistributionSpecUnavailableError(nodeId, err);
      }
      if (specText === null) {
        return inactive(nodeId, "repo_spec_missing");
      }

      // 4. Parse + extract. Content problems are permanent (fold no-ops, loudly).
      try {
        const spec = parseRepoSpec(specText);
        const config = extractDaoTokenDistributionConfig(spec);
        if (!config) {
          return inactive(nodeId, "distributions_inactive");
        }
        return {
          nodeId,
          distribution: {
            chainId: extractChainId(spec),
            tokenAddress: config.tokenAddress,
            emissionsHolderAddress: config.emissionsHolderAddress,
            distributorAddress: extractDistributorAddress(spec) ?? null,
          },
        };
      } catch (err) {
        // Includes "active but token/emissions_holder missing" (extract throws) and
        // unparseable specs — content is wrong in git, retrying won't fix it.
        log.warn(
          {
            event: "attribution.distribution_config_invalid",
            nodeId,
            slug: node.slug,
            err: String(err),
          },
          "node repo-spec has invalid/incomplete distribution config — fold will no-op"
        );
        return inactive(nodeId, "distribution_config_invalid");
      }
    },
  };
}
