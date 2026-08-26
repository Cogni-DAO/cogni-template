// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@app/(app)/identity/attest`
 * Purpose: Entry leg of the operator identity broker — validates a node's
 *   `identity.attestation.v1` request and starts a REAL GitHub authorization for it.
 * Scope: Validates protocol + node_id + nonce + target_origin + return_to, stashes the
 *   request in a signed HttpOnly cookie, and redirects to GitHub. Does not read any
 *   operator session, sign anything, or touch user data.
 * Invariants:
 *   - NO_OPERATOR_SESSION: no broker leg reads an operator session. Whoever is signed
 *     in to the operator is irrelevant — the subject comes from GitHub. Taking the
 *     subject from an ambient session is what bound the wrong account on the
 *     2026-08-19 candidate (task.5024). Enforced by a source guard in
 *     `tests/unit/app/identity-broker-oauth.test.ts`.
 *   - FAIL_BEFORE_GITHUB: an unknown node / unregistered origin / bad return_to is
 *     rejected here, never after an authentication the caller could not use.
 * Side-effects: IO (registry read, cookie set, redirect)
 * @public
 */

import { IdentityAttestationRequestSchema } from "@cogni/node-contracts";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  AttestationBrokerError,
  resolveAttestationTarget,
} from "@/app/_facades/identity/attestation-broker.server";
import { authSecret } from "@/auth";
import { getNodeId } from "@/shared/config";
import { serverEnv } from "@/shared/env";
import {
  brokerRedirectUri,
  brokerUrl,
  resolveGithubOauthClient,
} from "@/shared/identity/broker-config";
import {
  BROKER_STATE_COOKIE,
  BROKER_STATE_COOKIE_PATH,
  BROKER_STATE_TTL_SECONDS,
  encodeBrokerState,
} from "@/shared/identity/broker-state";
import {
  buildGithubAuthorizeUrl,
  createAuthorizationChallenge,
} from "@/shared/identity/github-oauth";
import { EVENT_NAMES, makeLogger } from "@/shared/observability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function one(value: string | null): string | undefined {
  return value === null ? undefined : value;
}

/**
 * Broker observability. These are the tier-1 markers `/validate-candidate` queries;
 * without them the broker is invisible in Loki and the feature cannot be proven at a
 * SHA. Deliberately NEVER logged: the authorization code, the access token, the PKCE
 * verifier, and the broker cookie. `githubLogin` IS logged — proving WHICH account was
 * attested is the entire point of task.5024.
 */
function brokerLog(): ReturnType<typeof makeLogger> {
  return makeLogger({ nodeId: getNodeId(), service: "identity-broker" });
}

function failure(errorCode: string, nodeId?: string): NextResponse {
  brokerLog().info(
    {
      event: EVENT_NAMES.IDENTITY_BROKER_REJECTED,
      leg: "start",
      errorCode,
      nodeId,
    },
    "Identity broker request rejected"
  );
  return NextResponse.redirect(
    brokerUrl(
      serverEnv(),
      `/identity/attest/error?code=${encodeURIComponent(errorCode)}`
    )
  );
}

export async function GET(request: Request): Promise<NextResponse> {
  const query = new URL(request.url).searchParams;
  const parsed = IdentityAttestationRequestSchema.safeParse({
    protocol: one(query.get("protocol")),
    nodeId: one(query.get("node_id")),
    nonce: one(query.get("nonce")),
    targetOrigin: one(query.get("target_origin")),
  });
  const returnTo = one(query.get("return_to"));
  if (!parsed.success || !returnTo) {
    return failure("invalid_request");
  }

  const client = resolveGithubOauthClient(serverEnv());
  if (!client) {
    return failure("attestation_unavailable");
  }

  let safeReturnTo: string;
  let nodeSlug: string;
  try {
    const target = await resolveAttestationTarget({
      request: parsed.data,
      returnTo,
    });
    safeReturnTo = target.safeReturnTo;
    nodeSlug = target.node.slug;
  } catch (error) {
    if (error instanceof AttestationBrokerError) {
      return failure(error.code, parsed.data.nodeId);
    }
    throw error;
  }

  const challenge = createAuthorizationChallenge();
  const cookieStore = await cookies();
  cookieStore.set(
    BROKER_STATE_COOKIE,
    await encodeBrokerState(
      {
        state: challenge.state,
        codeVerifier: challenge.codeVerifier,
        nodeId: parsed.data.nodeId,
        nodeSlug,
        nonce: parsed.data.nonce,
        targetOrigin: parsed.data.targetOrigin,
        returnTo: safeReturnTo,
      },
      authSecret
    ),
    {
      httpOnly: true,
      secure: serverEnv().isProd,
      // Lax survives GitHub's top-level redirect back to us.
      sameSite: "lax",
      path: BROKER_STATE_COOKIE_PATH,
      maxAge: BROKER_STATE_TTL_SECONDS,
    }
  );

  brokerLog().info(
    {
      event: EVENT_NAMES.IDENTITY_BROKER_STARTED,
      nodeId: parsed.data.nodeId,
      nodeSlug,
      targetOrigin: parsed.data.targetOrigin,
      // The corrected flow's signature: an authorization is actually requested, and
      // no operator session was consulted to get here.
      promptSelectAccount: true,
      pkce: "S256",
    },
    "Identity broker starting GitHub authorization"
  );

  return NextResponse.redirect(
    buildGithubAuthorizeUrl({
      clientId: client.clientId,
      redirectUri: brokerRedirectUri(serverEnv()),
      state: challenge.state,
      codeChallenge: challenge.codeChallenge,
    })
  );
}
