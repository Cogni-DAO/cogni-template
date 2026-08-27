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
 * Providers whose identity the broker can attest.
 *
 * This is deliberately NOT the sign-in provider list. The broker proves a CLAIMANT
 * identity — someone who authored commits — so it covers forges. Google, Apple and
 * Facebook identify a person for SIGN-IN but cannot identify a git author, so they
 * never belong here; they need `/api/auth/callback/{provider}` and nothing more.
 * Adding a forge (e.g. `gitlab`) means adding it here plus its exchange adapter —
 * the route itself is already provider-generic.
 */
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
