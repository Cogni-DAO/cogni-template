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
 *     already outside the proxy matcher, so it needs no namespace gymnastics.
 *   - REGISTER_THE_EXACT_URL: this full path must be registered on the OAuth app.
 *     Registering the `/api/auth/` prefix and expecting sub-paths to match works
 *     ONLY while an app has exactly one redirect URI — GitHub enables wildcard
 *     matching implicitly in that case. Add a second URI and matching becomes
 *     exact, silently breaking the first. That cost a failed human validation on
 *     2026-08-26; see the `oauth-per-env-proxy` hub entry.
 * Side-effects: none
 * Links: task.5024
 * @public
 */

/**
 * Providers the broker can attest **today**.
 *
 * This is a CONTRACT limit, not a taxonomy. `identity.attestation.v1` carries a
 * literal `github: {id, login}` claim, so v1 can only express a GitHub subject.
 * That is the only reason this list has one entry.
 *
 * It is NOT because attestation is git-specific. Our own ledger disagrees:
 * `claimantKey()` is `identity:${provider}:${externalId}`, and `user_bindings.provider`
 * already admits `wallet | discord | github | google`. A Discord contribution produces
 * the claimant `identity:discord:<snowflake>`, and whoever wants to claim it must
 * prove they control that Discord account on that node — which is precisely this
 * broker's job. Contributions to a node are not only commits, and a node may have no
 * GitHub involvement at all.
 *
 * Generalising means a v2 contract whose subject is `{provider, id, login}` rather
 * than a `github` field; the routes, cookie, and PKCE machinery are already
 * provider-generic. Tracked in the follow-up on task.5024 — do not "fix" this by
 * widening the list, which would sign a claim v1 cannot represent.
 */
/**
 * The node paths a relying node may be returned to, and what each one MEANS.
 *
 * `/profile` is the LINK leg — an already-signed-in node user attaching GitHub.
 * `/auth/attest/complete` is the SIGN-IN leg (task.5042) — a caller with no session,
 * who therefore cannot be sent anywhere behind that node's auth gate.
 *
 * A closed set, never a prefix: a node must not be able to nominate an arbitrary
 * landing page for a signed attestation. The pair also tells the confirm screen which
 * verb the human is actually looking at.
 */
export const ATTESTATION_LINK_PATH = "/profile";
export const ATTESTATION_SIGNIN_PATH = "/auth/attest/complete";
export const ATTESTATION_RETURN_PATHS: readonly string[] = [
  ATTESTATION_LINK_PATH,
  ATTESTATION_SIGNIN_PATH,
];

export const ATTESTABLE_PROVIDERS = ["github"] as const;

export type AttestableProvider = (typeof ATTESTABLE_PROVIDERS)[number];

export function isAttestableProvider(
  value: string
): value is AttestableProvider {
  return (ATTESTABLE_PROVIDERS as readonly string[]).includes(value);
}

/**
 * Registered callback path for one attestable provider.
 *
 * Mirrors NextAuth's `/api/auth/callback/{provider}` so the two callback families
 * read the same way, and matches the dynamic-segment shape already used by
 * `/api/auth/link/[provider]`.
 */
export function brokerCallbackPath(provider: AttestableProvider): string {
  return `/api/auth/attest/callback/${provider}`;
}

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

export function brokerRedirectUri(
  env: BrokerEnv,
  provider: AttestableProvider
): string {
  return brokerUrl(env, brokerCallbackPath(provider));
}

/**
 * Absolute URL for a broker page, built from the CONFIGURED public origin.
 *
 * Never derive these from `request.url`: inside the container that is the pod's
 * internal origin (`https://0.0.0.0:3000`), so every redirect would send the
 * browser somewhere unreachable. Caught on candidate-a at 5c8e75df — the error
 * and confirm hops both pointed at 0.0.0.0.
 */
export function brokerUrl(env: BrokerEnv, path: string): string {
  return new URL(path, env.APP_BASE_URL).toString();
}
