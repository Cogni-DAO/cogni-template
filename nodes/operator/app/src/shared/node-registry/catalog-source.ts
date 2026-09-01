// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@shared/node-registry/catalog-source`
 * Purpose: Resolves WHICH repository's `infra/catalog/` defines this environment's nodes.
 * Scope: Pure resolution over validated env. No IO.
 * Invariants:
 *   - RESOLUTION_IS_NOT_THE_PIN_TARGET: the repo whose catalog names this environment's
 *     nodes is not necessarily the repo the operator opens submodule pin PRs against.
 *     candidate-a and preview deliberately point `NODE_SUBMODULE_PARENT_*` at the
 *     disposable `cogni-test-org/cogni-monorepo` so node-formation flows are exercised
 *     against a throwaway org — but they deploy the nodes defined in `Cogni-DAO/cogni`.
 *     Conflating the two made `levelup` unresolvable: `unknown_node` on candidate-a, and
 *     on preview an UNCAUGHT `GitHub App not installed on cogni-test-org/cogni-monorepo
 *     (HTTP 404)` that surfaced as a 500 on the interactive auth path and killed the
 *     catalog registry reconcile outright (bug.5073).
 *   - BACKWARD_COMPATIBLE_DEFAULT: unset falls back to the submodule parent, so
 *     production — which already points at the real repo and therefore already worked —
 *     is unchanged whether or not its overlay sets the new pair.
 *   - PAIR_IS_ATOMIC: a partial catalog override fails closed. Never combine one override
 *     field with one fallback field into a repository identity that nobody configured.
 * Side-effects: none
 * Links: bug.5073, src/bootstrap/identity-attestation.ts, src/bootstrap/jobs/reconcileCatalogNodeRegistry.job.ts
 * @public
 */

interface NodeCatalogSourceEnv {
  readonly NODE_REGISTRY_CATALOG_OWNER?: string | undefined;
  readonly NODE_REGISTRY_CATALOG_REPO?: string | undefined;
  readonly NODE_SUBMODULE_PARENT_OWNER?: string | undefined;
  readonly NODE_SUBMODULE_PARENT_REPO?: string | undefined;
}

export interface NodeCatalogSource {
  readonly owner: string;
  readonly repo: string;
}

/**
 * The repo whose merged `infra/catalog/` is authoritative for "which nodes exist in this
 * environment". Returns null when neither pair is configured, so callers keep their
 * existing fail-closed behaviour rather than silently reading someone else's catalog.
 */
export function resolveNodeCatalogSource(
  env: NodeCatalogSourceEnv
): NodeCatalogSource | null {
  const overrideOwner = env.NODE_REGISTRY_CATALOG_OWNER;
  const overrideRepo = env.NODE_REGISTRY_CATALOG_REPO;
  if (overrideOwner || overrideRepo) {
    return overrideOwner && overrideRepo
      ? { owner: overrideOwner, repo: overrideRepo }
      : null;
  }

  const fallbackOwner = env.NODE_SUBMODULE_PARENT_OWNER;
  const fallbackRepo = env.NODE_SUBMODULE_PARENT_REPO;
  return fallbackOwner && fallbackRepo
    ? { owner: fallbackOwner, repo: fallbackRepo }
    : null;
}
