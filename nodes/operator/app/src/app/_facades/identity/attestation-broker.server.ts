// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@app/_facades/identity/attestation-broker.server`
 * Purpose: Completes the authenticated browser leg of identity.attestation.v1.
 * Scope: Resolves the registered node's canonical origins from deploy_envs, validates return_to,
 *   resolves configured signing custody, and delegates JWT issuance.
 * Invariants:
 *   - NO_OPEN_REDIRECT: return_to must be exactly the registered node's
 *     canonical `/profile` URL in one of its registered deploy environments.
 *   - SAME_REQUEST_BINDING: the exact nodeId + nonce + registered targetOrigin validated by the shared
 *     contract are passed unchanged to the issuer.
 *   - FRAGMENT_ONLY: the signed token is returned in a URL fragment, never a
 *     query string or cross-origin fetch response.
 * Side-effects: IO (registry/user reads)
 * @public
 */

import type { KeyObject } from "node:crypto";

import type { IdentityAttestationRequest } from "@cogni/node-contracts";
import type { SessionUser } from "@cogni/node-shared";
import {
  AttestationPreconditionError,
  issueIdentityAttestation,
} from "@/app/_facades/identity/attestation.server";
import { resolveServiceDb } from "@/bootstrap/container";
import { resolveNodeRef } from "@/features/nodes/node-lookup";
import { serverEnv } from "@/shared/env";
import { importAttestationSigningKey } from "@/shared/identity/attestation-keys";
import { hostForEnv, rootDomain } from "@/shared/node-registry/deploy-hosts";
import { baseDomain } from "@/shared/node-registry/resolve";

export type AttestationBrokerErrorCode =
  | "attestation_unavailable"
  | "invalid_return_to"
  | "unknown_node";

export class AttestationBrokerError extends Error {
  constructor(readonly code: AttestationBrokerErrorCode) {
    super(code);
    this.name = "AttestationBrokerError";
  }
}

function canonicalOrigin(configured: string | undefined): string | null {
  if (!configured) return null;
  try {
    const url = new URL(configured);
    if (url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Exact allowlist check: canonical registered-node origin plus `/profile`. */
export function validateAttestationReturnTo(
  returnTo: string,
  expectedNodeOrigin: string
): string | null {
  try {
    const url = new URL(returnTo);
    if (
      url.origin !== expectedNodeOrigin ||
      url.pathname !== "/profile" ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return `${expectedNodeOrigin}/profile`;
  } catch {
    return null;
  }
}

export async function issueBrowserIdentityAttestation(params: {
  sessionUser: SessionUser;
  request: IdentityAttestationRequest;
  returnTo: string;
}): Promise<{ redirectUrl: string }> {
  const env = serverEnv();
  const issuer = canonicalOrigin(env.APP_BASE_URL);
  const domain = baseDomain(env);
  if (!issuer || !domain || !env.IDENTITY_ATTESTATION_PRIVATE_KEY) {
    throw new AttestationBrokerError("attestation_unavailable");
  }

  const targetNode = await resolveNodeRef(
    resolveServiceDb(),
    params.request.nodeId
  );
  if (!targetNode || targetNode.nodeId !== params.request.nodeId) {
    throw new AttestationBrokerError("unknown_node");
  }

  const deployRootDomain = rootDomain(domain);
  const registeredOrigins = targetNode.deployEnvs.map(
    (deployEnv) =>
      `https://${hostForEnv(
        targetNode.slug,
        targetNode.slug === "operator",
        deployEnv,
        deployRootDomain
      )}`
  );
  if (!registeredOrigins.includes(params.request.targetOrigin)) {
    throw new AttestationBrokerError("invalid_return_to");
  }
  const safeReturnTo = validateAttestationReturnTo(
    params.returnTo,
    params.request.targetOrigin
  );
  if (!safeReturnTo) {
    throw new AttestationBrokerError("invalid_return_to");
  }

  let signingKey: KeyObject;
  try {
    signingKey = importAttestationSigningKey(
      env.IDENTITY_ATTESTATION_PRIVATE_KEY
    );
  } catch {
    throw new AttestationBrokerError("attestation_unavailable");
  }

  try {
    const issued = await issueIdentityAttestation({
      sessionUser: params.sessionUser,
      issuer,
      domain,
      signingKey,
      request: params.request,
    });
    return {
      redirectUrl: `${safeReturnTo}#attestation=${encodeURIComponent(
        issued.attestation
      )}`,
    };
  } catch (error) {
    if (
      error instanceof AttestationPreconditionError &&
      error.code === "unknown_node"
    ) {
      throw new AttestationBrokerError("unknown_node");
    }
    throw error;
  }
}
