// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/api/v1/identity/attestations`
 * Purpose: POST endpoint issuing an operator-signed portable identity
 *   attestation (task.5024) — a 10-minute EdDSA JWT binding the SIWE session
 *   user's wallet to their linked GitHub identity, verifiable by any node
 *   against this operator's /.well-known/jwks.json.
 * Scope: Session gate + shared-contract input validation + configured issuer /
 *   key resolution + error mapping; delegates node resolution, claim assembly,
 *   and signing to the attestation facade.
 * Invariants:
 *   - SIWE_SESSION_ONLY: uses getServerSessionUser (cookie session), never the
 *     agent-bearer resolver — an agent key must not mint wallet↔github claims.
 *   - CALLER_NEVER_SETS_AUDIENCE: body accepts {nodeId, nonce}; the facade
 *     resolves that registered node and derives its exact audience.
 *   - FAIL_CLOSED: unset/malformed signing key or canonical APP_BASE_URL → 503;
 *     missing wallet/github binding → 409; unknown node → 404.
 *   - CONFIGURED_ISSUER_ONLY: iss is the canonical APP_BASE_URL configuration,
 *     never request URL, Host, or forwarded headers.
 * Side-effects: IO (database reads; no writes — issuance is log-only v0)
 * Links: .context/designs/task.5024-fleet-identity-design.md, src/app/_facades/identity/attestation.server.ts
 * @public
 */

import type { KeyObject } from "node:crypto";

import { identityAttestationOperation } from "@cogni/node-contracts";
import { NextResponse } from "next/server";
import {
  AttestationPreconditionError,
  issueIdentityAttestation,
} from "@/app/_facades/identity/attestation.server";
import { wrapRouteHandlerWithLogging } from "@/bootstrap/http";
import { getServerSessionUser } from "@/lib/auth/server";
import { serverEnv } from "@/shared/env";
import { importAttestationSigningKey } from "@/shared/identity/attestation-keys";
import { baseDomain } from "@/shared/node-registry/resolve";
import { logRequestWarn } from "@/shared/observability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Normalize an explicit origin-only config value; reject paths/query/hash. */
function canonicalIssuer(configured: string | undefined): string | null {
  if (!configured) return null;
  try {
    const url = new URL(configured);
    if (url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export const POST = wrapRouteHandlerWithLogging(
  {
    routeId: "identity.attestations",
    auth: { mode: "required", getSessionUser: getServerSessionUser },
  },
  async (ctx, request, sessionUser) => {
    const env = serverEnv();
    const issuer = canonicalIssuer(env.APP_BASE_URL);
    const domain = baseDomain(env);
    if (!env.IDENTITY_ATTESTATION_PRIVATE_KEY || !issuer || !domain) {
      return NextResponse.json(
        { error: "attestation_unavailable" },
        { status: 503 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    const parsed = identityAttestationOperation.input.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    let signingKey: KeyObject;
    try {
      signingKey = importAttestationSigningKey(
        env.IDENTITY_ATTESTATION_PRIVATE_KEY
      );
    } catch (error) {
      logRequestWarn(ctx.log, error, "ATTESTATION_KEY_INVALID");
      return NextResponse.json(
        { error: "attestation_unavailable" },
        { status: 503 }
      );
    }

    try {
      const issued = await issueIdentityAttestation({
        sessionUser,
        issuer,
        domain,
        signingKey,
        request: parsed.data,
      });
      return NextResponse.json(
        identityAttestationOperation.output.parse(issued),
        { status: 201 }
      );
    } catch (error) {
      if (error instanceof AttestationPreconditionError) {
        return NextResponse.json(
          { error: error.code },
          {
            status:
              error.code === "unknown_node"
                ? 404
                : error.code === "invalid_target_origin"
                  ? 400
                  : 409,
          }
        );
      }
      throw error;
    }
  }
);
