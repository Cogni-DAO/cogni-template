// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@shared/identity/github-oauth`
 * Purpose: The operator's GitHub authorization-code leg for `identity.attestation.v1`.
 * Scope: Builds the authorize URL and exchanges one code for the authenticated GitHub
 *   identity. Does not touch cookies, sessions, the database, or attestation signing.
 * Invariants:
 *   - ACCOUNT_INTENT_IS_FORCED: every authorize request carries `prompt=select_account`
 *     so a browser already signed in to GitHub still gets the account picker.
 *     Necessary but NOT sufficient — the caller must also confirm the resolved login
 *     before signing anything (task.5024 confused-deputy fix).
 *   - LEAST_PRIVILEGE: empty `scope` — a claimant attestation needs only the public
 *     profile's stable numeric id. `allow_signup=false` keeps the flow to existing accounts.
 *   - TOKEN_IS_NEVER_PERSISTED: the access token lives inside `exchangeCodeForGithubIdentity`
 *     and is discarded when it returns. It is never stored, logged, or returned.
 *   - PKCE_S256: GitHub accepts S256 PKCE on both legs; we always send it.
 * Side-effects: IO (github.com token exchange, api.github.com user read)
 * Links: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps, task.5024
 * @public
 */

import { createHash, randomBytes } from "node:crypto";

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL = "https://api.github.com/user";

export type GithubOauthErrorCode =
  | "github_exchange_failed"
  | "github_identity_unavailable";

export class GithubOauthError extends Error {
  constructor(readonly code: GithubOauthErrorCode) {
    super(code);
    this.name = "GithubOauthError";
  }
}

export interface GithubIdentity {
  readonly id: string;
  readonly login: string | null;
}

function base64Url(input: Buffer): string {
  return input.toString("base64url");
}

/** Fresh, unguessable correlation value + PKCE pair for one broker request. */
export function createAuthorizationChallenge(): {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
} {
  const state = base64Url(randomBytes(32));
  const codeVerifier = base64Url(randomBytes(32));
  const codeChallenge = base64Url(
    createHash("sha256").update(codeVerifier).digest()
  );
  return { state, codeVerifier, codeChallenge };
}

export function buildGithubAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL(GITHUB_AUTHORIZE_URL);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  // LEAST_PRIVILEGE: public profile only.
  url.searchParams.set("scope", "");
  url.searchParams.set("allow_signup", "false");
  // ACCOUNT_INTENT_IS_FORCED.
  url.searchParams.set("prompt", "select_account");
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

/**
 * Exchange one authorization code for the authenticated GitHub identity.
 * The access token never leaves this function.
 */
export async function exchangeCodeForGithubIdentity(params: {
  clientId: string;
  clientSecret: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
}): Promise<GithubIdentity> {
  const doFetch = params.fetchImpl ?? fetch;

  const tokenResponse = await doFetch(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      client_id: params.clientId,
      client_secret: params.clientSecret,
      code: params.code,
      code_verifier: params.codeVerifier,
      redirect_uri: params.redirectUri,
    }),
  });
  if (!tokenResponse.ok) {
    throw new GithubOauthError("github_exchange_failed");
  }
  const tokenBody = (await tokenResponse.json().catch(() => null)) as {
    access_token?: unknown;
  } | null;
  const accessToken = tokenBody?.access_token;
  if (typeof accessToken !== "string" || !accessToken) {
    throw new GithubOauthError("github_exchange_failed");
  }

  const userResponse = await doFetch(GITHUB_USER_URL, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${accessToken}`,
      "user-agent": "cogni-identity-broker",
    },
  });
  if (!userResponse.ok) {
    throw new GithubOauthError("github_identity_unavailable");
  }
  const user = (await userResponse.json().catch(() => null)) as {
    id?: unknown;
    login?: unknown;
  } | null;
  if (typeof user?.id !== "number" && typeof user?.id !== "string") {
    throw new GithubOauthError("github_identity_unavailable");
  }
  return {
    id: String(user.id),
    login: typeof user.login === "string" ? user.login : null,
  };
}
