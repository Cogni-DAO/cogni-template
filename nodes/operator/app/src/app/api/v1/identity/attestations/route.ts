// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/api/v1/identity/attestations`
 * Purpose: POST endpoint issuing an operator-signed portable identity
 *   attestation (task.5024) — a 10-minute EdDSA JWT binding the SIWE session
 *   user's wallet to their linked GitHub identity, verifiable by any node
 *   against this operator's /.well-known/jwks.json.
 * Scope: Session gate + env/key resolution + error mapping; delegates claim
 *   assembly and signing to the attestation facade. No request body.
 * Invariants:
 *   - SIWE_SESSION_ONLY: uses getServerSessionUser (cookie session), never the
 *     agent-bearer resolver — an agent key must not mint wallet↔github claims.
 *   - FAIL_CLOSED: unset or malformed IDENTITY_ATTESTATION_PRIVATE_KEY → 503
 *     attestation_unavailable; missing wallet / github binding → 409.
 *   - NO_INTERNAL_BIND_ADDR: iss derives from forwarded headers first, so the
 *     issuer matches the origin nodes pin (COGNI_OPERATOR_ISSUER_URL).
 * Side-effects: IO (database reads; no writes — issuance is log-only v0)
 * Links: .context/designs/task.5024-fleet-identity-design.md, src/app/_facades/identity/attestation.server.ts
 * @public
 */

import type { KeyObject } from "node:crypto";

import { NextResponse } from "next/server";
import {
  AttestationPreconditionError,
  issueIdentityAttestation,
} from "@/app/_facades/identity/attestation.server";
import { wrapRouteHandlerWithLogging } from "@/bootstrap/http";
import { getServerSessionUser } from "@/lib/auth/server";
import { serverEnv } from "@/shared/env";
import { importAttestationSigningKey } from "@/shared/identity/attestation-keys";
import { logRequestWarn } from "@/shared/observability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** External origin this request reached us through (forwarded headers first). */
function publicOrigin(request: Request): string {
  const url = new URL(request.url);
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    url.host;
  const proto =
    request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export const POST = wrapRouteHandlerWithLogging(
  {
    routeId: "identity.attestations",
    auth: { mode: "required", getSessionUser: getServerSessionUser },
  },
  async (ctx, request, sessionUser) => {
    const env = serverEnv();
    if (!env.IDENTITY_ATTESTATION_PRIVATE_KEY) {
      return NextResponse.json(
        { error: "attestation_unavailable" },
        { status: 503 }
      );
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
        issuer: publicOrigin(request),
        signingKey,
      });
      return NextResponse.json(issued, { status: 201 });
    } catch (error) {
      if (error instanceof AttestationPreconditionError) {
        return NextResponse.json({ error: error.code }, { status: 409 });
      }
      throw error;
    }
  }
);
