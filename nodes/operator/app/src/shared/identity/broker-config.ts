// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@shared/identity/broker-config`
 * Purpose: Resolves the environment's GitHub OAuth client and the broker's exact
 *   registered redirect URI.
 * Scope: Pure resolution over validated env. No IO.
 * Invariants:
 *   - ONE_CLIENT_PER_ENVIRONMENT: never per node. A dedicated `GH_IDENTITY_OAUTH_*`
 *     pair is preferred because it keeps the broker decoupled from operator sign-in;
 *     the sign-in app is a fallback so the code works under either registration.
 *   - AUTH_CALLBACKS_LIVE_UNDER_/api/auth: this sits beside NextAuth's own
 *     `/api/auth/callback/github` and `/api/auth/link/[provider]`. That tree is
 *     already outside the proxy matcher, so it needs no namespace gymnastics —
 *     and, decisively, an OAuth App registers exactly ONE callback URL whose
 *     SUBDIRECTORIES are matched. Registering `https://<host>/api/auth/` covers
 *     NextAuth sign-in AND this broker with one entry. A callback anywhere else
 *     would force sign-in and identity onto separate OAuth Apps.
 *   - EXACT_REDIRECT: one fixed path, so GitHub's exact-match rule is satisfiable
 *     without wildcard subdomain matching (which would let any subdomain receive
 *     fleet authorization codes).
 * Side-effects: none
 * Links: task.5024
 * @public
 */

/** Registered callback path for the identity broker. */
export const BROKER_CALLBACK_PATH = "/api/auth/attest/callback";

interface BrokerEnv {
  readonly APP_BASE_URL?: string | undefined;
  readonly GH_IDENTITY_OAUTH_CLIENT_ID?: string | undefined;
  readonly GH_IDENTITY_OAUTH_CLIENT_SECRET?: string | undefined;
  readonly GH_OAUTH_CLIENT_ID?: string | undefined;
  readonly GH_OAUTH_CLIENT_SECRET?: string | undefined;
}

export interface GithubOauthClient {
  readonly clientId: string;
  readonly clientSecret: string;
}

export function resolveGithubOauthClient(
  env: BrokerEnv
): GithubOauthClient | null {
  const clientId =
    env.GH_IDENTITY_OAUTH_CLIENT_ID ?? env.GH_OAUTH_CLIENT_ID ?? "";
  const clientSecret =
    env.GH_IDENTITY_OAUTH_CLIENT_SECRET ?? env.GH_OAUTH_CLIENT_SECRET ?? "";
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function brokerRedirectUri(env: BrokerEnv): string {
  return new URL(BROKER_CALLBACK_PATH, env.APP_BASE_URL).toString();
}
