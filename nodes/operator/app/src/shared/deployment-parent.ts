// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@shared/deployment-parent`
 * Purpose: Typed reader for the declarative env -> deployment-parent contract.
 * Scope: Pure validation and formatting; no IO and no environment reads.
 * Invariants: ONE_DEPLOYMENT_PARENT_PER_ENV, DEPLOYMENT_PARENT_MATCHES_RUNTIME.
 * Side-effects: none
 * Links: infra/deployment-parents.json, task.5033
 * @public
 */

import deploymentParents from "../../../../../infra/deployment-parents.json";

export type DeploymentEnvironment = "candidate-a" | "preview" | "production";

export interface DeploymentParent {
  readonly owner: string;
  readonly repo: string;
}

export interface ValidatedDeploymentParent extends DeploymentParent {
  readonly env: DeploymentEnvironment;
}

const DEPLOYMENT_ENVIRONMENTS = new Set<string>([
  "candidate-a",
  "preview",
  "production",
]);

export function isDeploymentEnvironment(
  value: string | undefined
): value is DeploymentEnvironment {
  return value !== undefined && DEPLOYMENT_ENVIRONMENTS.has(value);
}

export function deploymentParentForEnv(
  env: DeploymentEnvironment
): DeploymentParent {
  return deploymentParents[env];
}

export function deploymentParentRepoUrl(parent: DeploymentParent): string {
  return `https://github.com/${parent.owner}/${parent.repo}.git`;
}

export function assertDeploymentParent(input: {
  readonly env: string | undefined;
  readonly owner: string;
  readonly repo: string;
}): ValidatedDeploymentParent {
  if (!isDeploymentEnvironment(input.env)) {
    throw new Error(
      `unsupported DEPLOY_ENVIRONMENT '${input.env ?? ""}' for deployment parent`
    );
  }
  const expected = deploymentParentForEnv(input.env);
  if (
    expected.owner.toLowerCase() !== input.owner.toLowerCase() ||
    expected.repo.toLowerCase() !== input.repo.toLowerCase()
  ) {
    throw new Error(
      `deployment parent mismatch for ${input.env}: expected ${expected.owner}/${expected.repo}, got ${input.owner}/${input.repo}`
    );
  }
  return { env: input.env, ...expected };
}
