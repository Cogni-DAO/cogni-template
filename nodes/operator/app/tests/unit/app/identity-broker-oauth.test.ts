// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * task.5024 regression suite for the operator identity broker's GitHub leg.
 *
 * The 2026-08-19 candidate bound the WRONG GitHub account because the broker never
 * performed an authorization at all — it read the ambient operator session's stored
 * binding. Every test here pins one property of the corrected flow.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  brokerRedirectUri,
  resolveGithubOauthClient,
} from "@/shared/identity/broker-config";
import {
  BROKER_STATE_COOKIE,
  decodeBrokerState,
  encodeBrokerState,
} from "@/shared/identity/broker-state";
import {
  buildGithubAuthorizeUrl,
  createAuthorizationChallenge,
  exchangeCodeForGithubIdentity,
  GithubOauthError,
} from "@/shared/identity/github-oauth";

const SECRET = "test-broker-secret-value-0123456789";
const SRC_ROOT = join(process.cwd(), "nodes/operator/app/src");

const BROKER_STATE = {
  state: "state-value",
  codeVerifier: "verifier-value",
  nodeId: "22222222-2222-4222-8222-222222222222",
  nodeSlug: "node-template",
  nonce: "node_generated_nonce_0123456789abcdef",
  targetOrigin: "https://node-template-test.cognidao.org",
  returnTo: "https://node-template-test.cognidao.org/profile",
};

describe("github authorize URL", () => {
  const url = new URL(
    buildGithubAuthorizeUrl({
      clientId: "client-id",
      redirectUri:
        "https://cognidao.org/api/v1/public/identity/attest/callback",
      state: "state-value",
      codeChallenge: "challenge-value",
    })
  );

  it("forces the account picker so a signed-in browser cannot silently decide", () => {
    expect(url.origin + url.pathname).toBe(
      "https://github.com/login/oauth/authorize"
    );
    expect(url.searchParams.get("prompt")).toBe("select_account");
  });

  it("requests no scopes and blocks signup — public profile id is all we need", () => {
    expect(url.searchParams.get("scope")).toBe("");
    expect(url.searchParams.get("allow_signup")).toBe("false");
  });

  it("sends S256 PKCE and the exact correlation state", () => {
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe("challenge-value");
    expect(url.searchParams.get("state")).toBe("state-value");
  });

  it("mints an unguessable, correctly-derived challenge per request", () => {
    const a = createAuthorizationChallenge();
    const b = createAuthorizationChallenge();
    expect(a.state).not.toBe(b.state);
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
    expect(a.state.length).toBeGreaterThanOrEqual(43);
    // S256 of a 32-byte verifier is always 43 base64url chars.
    expect(a.codeChallenge).toHaveLength(43);
  });
});

describe("github code exchange", () => {
  it("returns only the identity and never leaks or persists the access token", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("login/oauth/access_token")) {
        return new Response(JSON.stringify({ access_token: "gho_secret" }), {
          status: 200,
        });
      }
      return new Response(
        JSON.stringify({ id: 295942454, login: "flock-leader" }),
        { status: 200 }
      );
    });

    const identity = await exchangeCodeForGithubIdentity({
      clientId: "client-id",
      clientSecret: "client-secret",
      code: "code",
      codeVerifier: "verifier",
      redirectUri:
        "https://cognidao.org/api/v1/public/identity/attest/callback",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(identity).toEqual({ id: "295942454", login: "flock-leader" });
    expect(Object.keys(identity)).toEqual(["id", "login"]);
    expect(JSON.stringify(identity)).not.toContain("gho_secret");
    // PKCE verifier is actually sent on the exchange.
    expect(String(fetchImpl.mock.calls[0]?.[1]?.body)).toContain(
      "code_verifier"
    );
  });

  it("fails closed when GitHub will not issue a token", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 401 }));
    await expect(
      exchangeCodeForGithubIdentity({
        clientId: "c",
        clientSecret: "s",
        code: "code",
        codeVerifier: "verifier",
        redirectUri:
          "https://cognidao.org/api/v1/public/identity/attest/callback",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).rejects.toBeInstanceOf(GithubOauthError);
  });
});

describe("broker state cookie", () => {
  it("round-trips one request binding", async () => {
    const token = await encodeBrokerState(BROKER_STATE, SECRET);
    expect(await decodeBrokerState(token, SECRET)).toMatchObject(BROKER_STATE);
  });

  it("carries no GitHub identity until the authorization response supplies one", async () => {
    const token = await encodeBrokerState(BROKER_STATE, SECRET);
    expect((await decodeBrokerState(token, SECRET))?.github).toBeUndefined();

    const resolved = await encodeBrokerState(
      { ...BROKER_STATE, github: { id: "295942454", login: "flock-leader" } },
      SECRET
    );
    expect((await decodeBrokerState(resolved, SECRET))?.github).toEqual({
      id: "295942454",
      login: "flock-leader",
    });
  });

  it("rejects a cookie signed with another secret or absent entirely", async () => {
    const token = await encodeBrokerState(BROKER_STATE, SECRET);
    expect(
      await decodeBrokerState(token, "a-different-secret-value")
    ).toBeNull();
    expect(await decodeBrokerState(undefined, SECRET)).toBeNull();
    expect(await decodeBrokerState("garbage", SECRET)).toBeNull();
  });
});

describe("broker configuration", () => {
  it("prefers a dedicated broker client and falls back to the sign-in app", () => {
    expect(
      resolveGithubOauthClient({
        GH_IDENTITY_OAUTH_CLIENT_ID: "dedicated",
        GH_IDENTITY_OAUTH_CLIENT_SECRET: "dedicated-secret",
        GH_OAUTH_CLIENT_ID: "signin",
        GH_OAUTH_CLIENT_SECRET: "signin-secret",
      })
    ).toEqual({ clientId: "dedicated", clientSecret: "dedicated-secret" });

    expect(
      resolveGithubOauthClient({
        GH_OAUTH_CLIENT_ID: "signin",
        GH_OAUTH_CLIENT_SECRET: "signin-secret",
      })
    ).toEqual({ clientId: "signin", clientSecret: "signin-secret" });

    expect(resolveGithubOauthClient({})).toBeNull();
  });

  it("pins one exact redirect URI so GitHub exact-matching is satisfiable", () => {
    expect(brokerRedirectUri({ APP_BASE_URL: "https://cognidao.org" })).toBe(
      "https://cognidao.org/api/v1/public/identity/attest/callback"
    );
  });
});

/**
 * THE regression. The bug was not a missing check — it was the presence of a session
 * read. If any broker leg reintroduces `getServerSessionUser` or a `user_bindings`
 * lookup, the ambient operator account can silently choose the attested subject again.
 */
describe("no operator session in the broker flow", () => {
  const BROKER_SOURCES = [
    "app/(app)/identity/attest/route.ts",
    "app/(app)/identity/attest/confirm/page.tsx",
    "app/api/v1/public/identity/attest/callback/route.ts",
    "app/api/v1/public/identity/attest/confirm/route.ts",
    "app/_facades/identity/attestation-broker.server.ts",
    "features/identity/services/issue-identity-attestation.ts",
    "adapters/server/identity/identity-attestation.adapter.ts",
  ];

  it.each(BROKER_SOURCES)("%s reads no operator session", (relative) => {
    const source = readFileSync(join(SRC_ROOT, relative), "utf8");
    expect(source).not.toContain("getServerSessionUser");
    expect(source).not.toContain("userBindings");
    expect(source).not.toContain("findGithubIdentity");
  });

  it("keeps the broker state cookie name stable across legs", () => {
    expect(BROKER_STATE_COOKIE).toBe("identity_broker_state");
  });
});

/**
 * The perimeter is the second place this bug can come back. If `/identity` is
 * re-added to APP_ROUTES, the proxy bounces an anonymous visitor to sign-in and the
 * broker is once again reachable only with an operator session — the exact
 * precondition for the confused deputy. And if the callback/confirm legs leave
 * `/api/v1/public/`, the proxy 401s GitHub's redirect before the handler runs.
 */
describe("broker perimeter stays session-free", () => {
  const proxySource = readFileSync(join(SRC_ROOT, "proxy.ts"), "utf8");
  const appRoutes = proxySource
    .slice(
      proxySource.indexOf("const APP_ROUTES"),
      proxySource.indexOf("function isAppRoute")
    )
    .replace(/\/\/.*$/gm, "");

  it("does not session-gate /identity as an app route", () => {
    expect(appRoutes).not.toContain('"/identity"');
  });

  it("routes both broker API legs through the public namespace", () => {
    expect(
      brokerRedirectUri({ APP_BASE_URL: "https://cognidao.org" })
    ).toContain("/api/v1/public/");
    const confirmPage = readFileSync(
      join(SRC_ROOT, "app/(app)/identity/attest/confirm/page.tsx"),
      "utf8"
    );
    expect(confirmPage).toContain(
      'action="/api/v1/public/identity/attest/confirm"'
    );
  });

  it("still session-gates the ordinary app routes", () => {
    for (const route of ['"/chat"', '"/profile"', '"/gov"', '"/nodes"']) {
      expect(appRoutes).toContain(route);
    }
  });
});
