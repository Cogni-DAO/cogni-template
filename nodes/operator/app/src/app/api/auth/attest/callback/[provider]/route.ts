// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@app/api/auth/attest/callback/[provider]`
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
 *   - PROVIDER_IS_BOUND: the `[provider]` segment must be attestable AND must equal the
 *     provider recorded when the round trip started, so a response cannot be replayed
 *     onto a different provider's callback.
 *   - SITS_WITH_NEXTAUTH: unauthenticated by design — GitHub redirects the browser
 *     here with no session — and placed beside `/api/auth/callback/github` so one
 *     registered OAuth callback prefix (`/api/auth/`) covers sign-in and identity.
 * Side-effects: IO (GitHub token exchange + user read, cookie rewrite, redirect)
 * @public
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authSecret } from "@/auth";
import { getNodeId } from "@/shared/config";
import { serverEnv } from "@/shared/env";
import {
  brokerRedirectUri,
  brokerUrl,
  isAttestableProvider,
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
import { EVENT_NAMES, makeLogger } from "@/shared/observability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

function failure(errorCode: string): NextResponse {
  brokerLog().info(
    {
      event: EVENT_NAMES.IDENTITY_BROKER_REJECTED,
      leg: "callback",
      errorCode,
    },
    "Identity broker callback rejected"
  );
  return NextResponse.redirect(
    brokerUrl(
      serverEnv(),
      `/identity/attest/error?code=${encodeURIComponent(errorCode)}`
    )
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> }
): Promise<NextResponse> {
  const { provider } = await context.params;
  if (!isAttestableProvider(provider)) {
    return failure("invalid_request");
  }

  const query = new URL(request.url).searchParams;
  const cookieStore = await cookies();
  const brokerState = await decodeBrokerState(
    cookieStore.get(BROKER_STATE_COOKIE)?.value,
    authSecret
  );
  if (!brokerState) {
    return failure("broker_request_expired");
  }

  // PROVIDER_IS_BOUND — the path segment must match the round trip that was started.
  if (brokerState.provider !== provider) {
    cookieStore.delete(BROKER_STATE_COOKIE);
    return failure("invalid_request");
  }

  // The user declined at GitHub, or GitHub refused.
  if (query.get("error")) {
    cookieStore.delete(BROKER_STATE_COOKIE);
    return failure("github_declined");
  }

  const code = query.get("code");
  const state = query.get("state");
  if (!code || !state || state !== brokerState.state) {
    cookieStore.delete(BROKER_STATE_COOKIE);
    return failure("invalid_request");
  }

  const env = serverEnv();
  const client = resolveGithubOauthClient(env);
  if (!client) {
    cookieStore.delete(BROKER_STATE_COOKIE);
    return failure("attestation_unavailable");
  }

  let github: { id: string; login: string | null };
  try {
    github = await exchangeCodeForGithubIdentity({
      clientId: client.clientId,
      clientSecret: client.clientSecret,
      code,
      codeVerifier: brokerState.codeVerifier,
      redirectUri: brokerRedirectUri(env, provider),
    });
  } catch {
    cookieStore.delete(BROKER_STATE_COOKIE);
    return failure("github_exchange_failed");
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

  brokerLog().info(
    {
      event: EVENT_NAMES.IDENTITY_BROKER_AUTHENTICATED,
      nodeId: brokerState.nodeId,
      nodeSlug: brokerState.nodeSlug,
      githubId: github.id,
      githubLogin: github.login,
    },
    "Identity broker authenticated a GitHub account; awaiting human confirmation"
  );

  return NextResponse.redirect(brokerUrl(env, "/identity/attest/confirm"));
}
