// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/_facades/identity/attestation.server`
 * Purpose: Issues an operator-signed portable identity attestation — a
 *   short-lived EdDSA JWT binding the session user's wallet to their GitHub
 *   identity for one exact registered node and its one-time nonce, verifiable
 *   against /.well-known/jwks.json.
 * Scope: Resolves the target node, reads the user's wallet + github binding,
 *   validates the shared v1 claims contract, and signs the JWT. Does not handle
 *   HTTP transport, env resolution, key custody, or RP-side nonce consumption.
 * Invariants:
 *   - WALLET_LOWERCASED: the wallet claim is always lowercased so node-side
 *     equality checks never depend on checksum casing.
 *   - GITHUB_ID_AS_STORED: `github.id` is user_bindings.external_id verbatim
 *     (a string) — importing nodes persist the same shape (NO_AUTO_MERGE keys
 *     on provider+external_id).
 *   - EXACT_NODE_AUDIENCE: aud is derived from a registered node UUID; callers
 *     never supply an audience string and a token cannot be replayed at a peer.
 *   - EXACT_DEPLOYMENT_ORIGIN: targetOrigin must be one canonical origin
 *     derived from the node registry's deployEnvs and is signed into the JWT.
 *   - NONCE_BOUND: the node-minted nonce is signed; the relying node consumes it once.
 *   - TTL_600S: exp = iat + 600.
 *   - PRECONDITIONS_FAIL_CLOSED: missing wallet / github binding / registered
 *     node throw AttestationPreconditionError (never a silent token).
 * Side-effects: IO (database reads)
 * Links: .context/designs/task.5024-fleet-identity-design.md, docs/spec/decentralized-identity.md
 * @public
 */

import type { KeyObject } from "node:crypto";
import { randomUUID } from "node:crypto";

import { withTenantScope } from "@cogni/db-client";
import { type UserId, userActor } from "@cogni/ids";
import {
  IDENTITY_ATTESTATION_TTL_SECONDS,
  IDENTITY_ATTESTATION_V1,
  IdentityAttestationClaimsSchema,
  type IdentityAttestationRequest,
  identityAttestationAudience,
} from "@cogni/node-contracts";
import type { SessionUser } from "@cogni/node-shared";
import { and, eq } from "drizzle-orm";
import { SignJWT } from "jose";
import { resolveAppDb, resolveServiceDb } from "@/bootstrap/container";
import { resolveNodeRef } from "@/features/nodes/node-lookup";
import { userBindings, users } from "@/shared/db/schema";
import {
  ATTESTATION_ALG,
  attestationKeyId,
} from "@/shared/identity/attestation-keys";
import {
  hostForEnv,
  isFlightEnv,
  rootDomain,
} from "@/shared/node-registry/deploy-hosts";

export type AttestationPreconditionCode =
  | "no_github_binding"
  | "no_wallet"
  | "invalid_target_origin"
  | "unknown_node";

/** Missing wallet, github binding, or registered target node. */
export class AttestationPreconditionError extends Error {
  constructor(readonly code: AttestationPreconditionCode) {
    super(code);
    this.name = "AttestationPreconditionError";
  }
}

export interface IssuedAttestation {
  attestation: string;
  expiresIn: number;
}

/**
 * Issue the attestation JWT for the authenticated session user.
 * Claims match the shared identity.attestation.v1 contract exactly.
 */
export async function issueIdentityAttestation(params: {
  sessionUser: SessionUser;
  issuer: string;
  domain: string;
  signingKey: KeyObject;
  request: IdentityAttestationRequest;
}): Promise<IssuedAttestation> {
  const { sessionUser, issuer, domain, signingKey, request } = params;
  const targetNode = await resolveNodeRef(resolveServiceDb(), request.nodeId);
  if (!targetNode || targetNode.nodeId !== request.nodeId) {
    throw new AttestationPreconditionError("unknown_node");
  }

  const deployRootDomain = rootDomain(domain);
  const registeredOrigins = targetNode.deployEnvs
    .filter(isFlightEnv)
    .map(
      (deployEnv) =>
        `https://${hostForEnv(
          targetNode.slug,
          targetNode.slug === "operator",
          deployEnv,
          deployRootDomain
        )}`
    );
  if (!registeredOrigins.includes(request.targetOrigin)) {
    throw new AttestationPreconditionError("invalid_target_origin");
  }

  const db = resolveAppDb();
  const actorId = userActor(sessionUser.id as UserId);

  const { binding, user } = await withTenantScope(db, actorId, async (tx) => {
    const [bindings, userRow] = await Promise.all([
      tx
        .select({
          externalId: userBindings.externalId,
          providerLogin: userBindings.providerLogin,
        })
        .from(userBindings)
        .where(
          and(
            eq(userBindings.userId, sessionUser.id),
            eq(userBindings.provider, "github")
          )
        )
        .limit(1),
      tx.query.users.findFirst({
        where: eq(users.id, sessionUser.id),
        columns: { walletAddress: true },
      }),
    ]);
    return { binding: bindings[0], user: userRow };
  });

  const wallet = user?.walletAddress ?? sessionUser.walletAddress;
  if (!wallet) throw new AttestationPreconditionError("no_wallet");
  if (!binding) throw new AttestationPreconditionError("no_github_binding");

  const iat = Math.floor(Date.now() / 1000);
  const kid = await attestationKeyId(signingKey);
  const claims = IdentityAttestationClaimsSchema.parse({
    type: IDENTITY_ATTESTATION_V1,
    iss: issuer,
    sub: sessionUser.id,
    aud: identityAttestationAudience(targetNode.nodeId),
    nodeId: targetNode.nodeId,
    nonce: request.nonce,
    targetOrigin: request.targetOrigin,
    wallet: wallet.toLowerCase(),
    github: { id: binding.externalId, login: binding.providerLogin },
    iat,
    exp: iat + IDENTITY_ATTESTATION_TTL_SECONDS,
    jti: randomUUID(),
  });
  const attestation = await new SignJWT(claims)
    .setProtectedHeader({ alg: ATTESTATION_ALG, typ: "JWT", kid })
    .sign(signingKey);

  return { attestation, expiresIn: IDENTITY_ATTESTATION_TTL_SECONDS };
}
