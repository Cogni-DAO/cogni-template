// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@ports/catalog-node-registry`
 * Purpose: Project merged git catalog intent into one environment's local node registry.
 * Scope: Interface only. Stable wallet identity crosses environments; local user IDs never do.
 * Invariants:
 *   - GIT_IS_REGISTRY_INTENT: catalog definitions are the projection input.
 *   - USER_IDS_ARE_ENV_LOCAL: owner_wallet resolves to a local users.id in each database.
 *   - LIFECYCLE_IS_MONOTONIC: reconciliation never regresses an existing node status.
 * Side-effects: none
 * Links: infra/catalog/_schema.json, src/bootstrap/jobs/reconcileCatalogNodeRegistry.job.ts
 * @public
 */

import type { CatalogNodeDefinition } from "./deploy-plane.port";

export interface CatalogNodeOwnerProjection {
  readonly nodeId: string;
  readonly ownerUserId: string;
}

export interface CatalogNodeRegistryReconcileSummary {
  readonly projected: number;
  readonly owners: readonly CatalogNodeOwnerProjection[];
}

export interface CatalogNodeRegistryPort {
  reconcile(
    definitions: readonly CatalogNodeDefinition[]
  ): Promise<CatalogNodeRegistryReconcileSummary>;
}
