// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/node-app-scaffold/gens/envs`
 * Purpose: Single source for supported deployment environments and the candidate-only birth set.
 * Scope: Pure constants consumed by node-formation generators and route observability.
 * Side-effects: none
 * Links: docs/guides/create-node.md, docs/spec/secrets-management.md
 * @public
 */

/**
 * Every environment that can be managed after birth. Candidate-b/canary are not
 * deployment targets.
 */
export const NODE_DEPLOY_ENVS = [
  "candidate-a",
  "preview",
  "production",
] as const;

export type NodeFormationEnv = (typeof NODE_DEPLOY_ENVS)[number];

/**
 * Activity-authority protocol generation 1: fresh nodes start in candidate-a
 * only. Preview and production may be added as passive deployments, but v1 has
 * no authority-transfer verb; birth must not run a second activity ledger.
 */
export const NODE_FORMATION_ENVS = [
  "candidate-a",
] as const satisfies readonly NodeFormationEnv[];

/** The fixed generation-1 activity environment stamped at birth. */
export const NODE_FORMATION_ACTIVITY_ENV = "candidate-a" as const;
