// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/_facades/identity/attestation.server`
 * Purpose: Issues an operator-signed portable identity attestation — a
 *   short-lived EdDSA JWT binding the session user's wallet to their GitHub
 *   identity, verifiable by any node against /.well-known/jwks.json.
 * Scope: Reads the user's wallet + github user_binding, signs the JWT. Does
 *   not handle HTTP transport, env resolution, or key custody.
 * Invariants:
 *   - WALLET_LOWERCASED: the wallet claim is always lowercased so node-side
 *     equality checks never depend on checksum casing.
 *   - GITHUB_ID_AS_STORED: `github.id` is user_bindings.external_id verbatim
 *     (a string) — importing nodes persist the same shape (NO_AUTO_MERGE keys
 *     on provider+external_id).
 *   - TTL_600S: exp = iat + 600. Multi-node reuse within the TTL is a feature;
 *     replay is bounded by the node-side live-SIWE-session requirement.
 *   - PRECONDITIONS_ARE_409: missing wallet / github binding throw
 *     AttestationPreconditionError (route maps to 409, never a silent token).
 * Side-effects: IO (database reads)
 * Links: .context/designs/task.5024-fleet-identity-design.md, docs/spec/decentralized-identity.md
 * @public
 */

import type { KeyObject } from "node:crypto";
import { randomUUID } from "node:crypto";

import { withTenantScope } from "@cogni/db-client";
import { type UserId, userActor } from "@cogni/ids";
import type { SessionUser } from "@cogni/node-shared";
import { and, eq } from "drizzle-orm";
import { SignJWT } from "jose";
import { resolveAppDb } from "@/bootstrap/container";
import { userBindings, users } from "@/shared/db/schema";
import {
  ATTESTATION_ALG,
  attestationKeyId,
} from "@/shared/identity/attestation-keys";

export const ATTESTATION_TTL_SECONDS = 600;

export type AttestationPreconditionCode = "no_github_binding" | "no_wallet";

/** Missing wallet or github binding — the route maps this to HTTP 409. */
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
 * Claims: { iss, sub: users.id, wallet, github: { id, login }, iat, exp, jti }.
 */
export async function issueIdentityAttestation(params: {
  sessionUser: SessionUser;
  issuer: string;
  signingKey: KeyObject;
}): Promise<IssuedAttestation> {
  const { sessionUser, issuer, signingKey } = params;
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
  const attestation = await new SignJWT({
    wallet: wallet.toLowerCase(),
    github: { id: binding.externalId, login: binding.providerLogin },
  })
    .setProtectedHeader({ alg: ATTESTATION_ALG, typ: "JWT", kid })
    .setIssuer(issuer)
    .setSubject(sessionUser.id)
    .setIssuedAt(iat)
    .setExpirationTime(iat + ATTESTATION_TTL_SECONDS)
    .setJti(randomUUID())
    .sign(signingKey);

  return { attestation, expiresIn: ATTESTATION_TTL_SECONDS };
}
