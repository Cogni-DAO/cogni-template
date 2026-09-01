// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@bootstrap/capabilities/operator-deploy-plane`
 * Purpose: Factories for the operator-local deploy plane and its least-privilege catalog-control identity.
 * Scope: Selects validated GitHub App credential pairs and returns the shared deploy-plane adapter.
 * Side-effects: none (adapter calls deferred to callers)
 * Links: task.5063, infra/secrets-catalog.yaml, src/ports/deploy-plane.port.ts,
 *   src/adapters/server/vcs/github-repo-write.ts
 * @internal
 */

import { GitHubRepoWriter } from "@/adapters/server";
import type { DeployPlanePort } from "@/ports";
import type { ServerEnv } from "@/shared/env";

function createGitHubDeployPlane(credentials: {
  readonly appId: string;
  readonly privateKeyBase64: string;
}): DeployPlanePort {
  const privateKey = Buffer.from(
    credentials.privateKeyBase64,
    "base64"
  ).toString("utf-8");
  return new GitHubRepoWriter({ appId: credentials.appId, privateKey });
}

export function createOperatorDeployPlane(env: ServerEnv): DeployPlanePort {
  if (!env.GH_REVIEW_APP_ID || !env.GH_REVIEW_APP_PRIVATE_KEY_BASE64) {
    throw new Error(
      "operator not configured for deploy plane: GH_REVIEW_APP_ID + GH_REVIEW_APP_PRIVATE_KEY_BASE64 required"
    );
  }
  return createGitHubDeployPlane({
    appId: env.GH_REVIEW_APP_ID,
    privateKeyBase64: env.GH_REVIEW_APP_PRIVATE_KEY_BASE64,
  });
}

/**
 * Catalog-read + candidate-workflow plane. Candidate may inject a selected-repo,
 * read+Actions-only App without widening the review App used by merge/publish flows.
 * Production/unset behavior is exactly the existing review-App plane.
 */
export function createCatalogControlDeployPlane(
  env: ServerEnv
): DeployPlanePort {
  const appId = env.GH_CANDIDATE_CONTROL_APP_ID;
  const privateKeyBase64 = env.GH_CANDIDATE_CONTROL_APP_PRIVATE_KEY_BASE64;
  if (appId || privateKeyBase64) {
    if (!appId || !privateKeyBase64) {
      throw new Error(
        "operator catalog control plane misconfigured: GH_CANDIDATE_CONTROL_APP_ID + GH_CANDIDATE_CONTROL_APP_PRIVATE_KEY_BASE64 must be set together"
      );
    }
    return createGitHubDeployPlane({ appId, privateKeyBase64 });
  }
  return createOperatorDeployPlane(env);
}
