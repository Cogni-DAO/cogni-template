// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@app/api/v1/public/identity/attest/callback`
 * Purpose: GitHub's authorization response for one in-flight broker request.
 * Scope: Matches `state` against the signed broker cookie, exchanges the code (PKCE),
 *   reads the authenticated GitHub identity, and hands off to the confirm screen.
 *   Signs nothing — the human must confirm the resolved account first.
 * Invariants:
 *   - STATE_MUST_MATCH: a callback whose `state` does not equal the cookie's is dropped.
 *   - SUBJECT_FROM_THIS_RESPONSE: the identity written into the broker cookie comes from
 *     this exchange only — never a session, never a stored binding (task.5024).
 *   - TOKEN_IS_NEVER_PERSISTED: the access token is discarded inside the exchange.
 *   - NO_ACCOUNT_MINTED: authenticating here creates no operator user, binding, or event.
 * Side-effects: IO (GitHub token exchange + user read, cookie rewrite, redirect)
 * @public
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { authSecret } from "@/auth";
import { serverEnv } from "@/shared/env";
import {
  brokerRedirectUri,
  resolveGithubOauthClient,
} from "@/shared/identity/broker-config";
import {
  BROKER_STATE_COOKIE,
  BROKER_STATE_COOKIE_PATH,
  BROKER_STATE_TTL_SECONDS,
  decodeBrokerState,
  encodeBrokerState,
} from "@/shared/identity/broker-state";
import { exchangeCodeForGithubIdentity } from "@/shared/identity/github-oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function failure(request: Request, code: string): NextResponse {
  return NextResponse.redirect(
    new URL(
      `/identity/attest/error?code=${encodeURIComponent(code)}`,
      request.url
    )
  );
}

export async function GET(request: Request): Promise<NextResponse> {
  const query = new URL(request.url).searchParams;
  const cookieStore = await cookies();
  const brokerState = await decodeBrokerState(
    cookieStore.get(BROKER_STATE_COOKIE)?.value,
    authSecret
  );
  if (!brokerState) {
    return failure(request, "broker_request_expired");
  }

  // The user declined at GitHub, or GitHub refused.
  if (query.get("error")) {
    cookieStore.delete(BROKER_STATE_COOKIE);
    return failure(request, "github_declined");
  }

  const code = query.get("code");
  const state = query.get("state");
  if (!code || !state || state !== brokerState.state) {
    cookieStore.delete(BROKER_STATE_COOKIE);
    return failure(request, "invalid_request");
  }

  const env = serverEnv();
  const client = resolveGithubOauthClient(env);
  if (!client) {
    cookieStore.delete(BROKER_STATE_COOKIE);
    return failure(request, "attestation_unavailable");
  }

  let github: { id: string; login: string | null };
  try {
    github = await exchangeCodeForGithubIdentity({
      clientId: client.clientId,
      clientSecret: client.clientSecret,
      code,
      codeVerifier: brokerState.codeVerifier,
      redirectUri: brokerRedirectUri(env),
    });
  } catch {
    cookieStore.delete(BROKER_STATE_COOKIE);
    return failure(request, "github_exchange_failed");
  }

  cookieStore.set(
    BROKER_STATE_COOKIE,
    await encodeBrokerState({ ...brokerState, github }, authSecret),
    {
      httpOnly: true,
      secure: env.isProd,
      sameSite: "lax",
      path: BROKER_STATE_COOKIE_PATH,
      maxAge: BROKER_STATE_TTL_SECONDS,
    }
  );

  return NextResponse.redirect(
    new URL("/identity/attest/confirm", request.url)
  );
}
