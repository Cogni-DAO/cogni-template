// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/_facades/identity/attestation.server`
 * Purpose: Issues an operator-signed portable identity attestation — a
 *   short-lived EdDSA JWT binding the session user's wallet to their GitHub
 *   identity for one exact registered node and its one-time nonce, verifiable
 *   against /.well-known/jwks.json.
 * Scope: Thin app wiring around the identity feature service. Does not own
 *   registry, persistence, claim, origin, or signing policy.
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
 * Side-effects: IO through injected ports
 * Links: docs/spec/decentralized-user-identity.md
 * @public
 */

import type { KeyObject } from "node:crypto";

import type { IdentityAttestationRequest } from "@cogni/node-contracts";
import type { SessionUser } from "@cogni/node-shared";
import { resolveIdentityAttestationDependencies } from "@/bootstrap/identity-attestation";
import {
  AttestationPreconditionError,
  createIdentityAttestationService,
  type IssuedAttestation,
} from "@/features/identity/services/issue-identity-attestation";

export { AttestationPreconditionError };
export type { IssuedAttestation };

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
  const service = createIdentityAttestationService(
    resolveIdentityAttestationDependencies(signingKey)
  );
  return service.issue({
    userId: sessionUser.id,
    fallbackWalletAddress: sessionUser.walletAddress,
    issuer,
    domain,
    request,
  });
}
