// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/** Composition factory for identity-attestation persistence and signing ports. */

import { type KeyObject, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  JoseIdentityAttestationSigner,
  OperatorIdentityAttestationRepository,
} from "@/adapters/server";

import { createOperatorDeployPlane } from "@/bootstrap/capabilities/operator-deploy-plane";
import { getContainer, resolveServiceDb } from "@/bootstrap/container";
import { nodes } from "@/shared/db/schema";
import { serverEnv } from "@/shared/env/server-env";

/**
 * Service-role read of one node row for the identity broker (bug.5063).
 *
 * Service-role because this runs with no session by construction — the broker never
 * reads one (task.5024) — and it touches no user data: id, slug, and the deploy-env
 * list that forms the registered-origin allowlist.
 *
 * Returns null on read failure so the caller falls back to the catalog rather than
 * failing open on a node it could not verify.
 */
async function findNodeRow(nodeId: string) {
  try {
    const rows = await resolveServiceDb()
      .select({
        id: nodes.id,
        slug: nodes.slug,
        deployEnvs: nodes.deployEnvs,
      })
      .from(nodes)
      .where(eq(nodes.id, nodeId))
      .limit(1);
    const row = rows[0];
    return row ? { ...row, deployEnvs: row.deployEnvs ?? [] } : null;
  } catch {
    return null;
  }
}

export function resolveIdentityAttestationDependencies(signingKey: KeyObject) {
  const env = serverEnv();
  const parentOwner = env.NODE_SUBMODULE_PARENT_OWNER;
  const parentRepo = env.NODE_SUBMODULE_PARENT_REPO;
  if (!parentOwner || !parentRepo) {
    throw new Error(
      "identity attestation requires NODE_SUBMODULE_PARENT_OWNER + NODE_SUBMODULE_PARENT_REPO"
    );
  }
  return {
    repository: new OperatorIdentityAttestationRepository(
      createOperatorDeployPlane(env),
      { parentOwner, parentRepo },
      findNodeRow
    ),
    signer: new JoseIdentityAttestationSigner(signingKey),
    clock: getContainer().clock,
    createJti: randomUUID,
  };
}
