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
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  ATTESTABLE_PROVIDERS,
  brokerCallbackPath,
  brokerRedirectUri,
  brokerUrl,
  isAttestableProvider,
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
// Resolve from this file, not cwd — turbo runs the suite from nodes/operator/app.
const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../src");

const BROKER_STATE = {
  provider: "github",
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
      redirectUri: "https://cognidao.org/api/auth/attest/callback/github",
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
      redirectUri: "https://cognidao.org/api/auth/attest/callback/github",
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
        redirectUri: "https://cognidao.org/api/auth/attest/callback/github",
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
    expect(
      brokerRedirectUri({ APP_BASE_URL: "https://cognidao.org" }, "github")
    ).toBe("https://cognidao.org/api/auth/attest/callback/github");
  });

  it("builds broker page URLs from the configured public origin", () => {
    expect(
      brokerUrl(
        { APP_BASE_URL: "https://test.cognidao.org" },
        "/identity/attest/error?code=x"
      )
    ).toBe("https://test.cognidao.org/identity/attest/error?code=x");
  });

  /**
   * Caught on candidate-a at 5c8e75df: every broker redirect was built with
   * `new URL(path, request.url)`. Inside the container `request.url` is the pod's
   * own origin, so the browser was sent to `https://0.0.0.0:3000/identity/attest/error`
   * — a dead end on the error path AND on the callback→confirm hop, mid-flow.
   * Redirect targets must come from the configured public origin.
   */
  it.each([
    "app/(app)/identity/attest/route.ts",
    "app/api/auth/attest/callback/[provider]/route.ts",
    "app/api/auth/attest/confirm/route.ts",
  ])("%s never builds a redirect from request.url", (relative) => {
    const source = readFileSync(join(SRC_ROOT, relative), "utf8");
    // Parsing the query off request.url is fine; using it as a redirect BASE is not.
    expect(source).not.toMatch(/new URL\([^)]*,\s*request\.url\s*\)/);
  });

  /**
   * Keep the broker callback under `/api/auth/`, beside NextAuth's own — it groups the
   * auth routes and keeps them outside the proxy's session gate.
   *
   * It does NOT buy free registration, and believing it did cost a failed human
   * validation on 2026-08-26. Prefix matching works only while an OAuth app holds
   * exactly ONE redirect URI — GitHub enables wildcard matching implicitly in that case.
   * Adding a second URI switches the app to exact matching and silently breaks the
   * first, surfacing as "The redirect_uri is not associated with this application".
   * So EVERY auth route needs its own exact URI registered; there are 10 slots.
   */
  it("attests exactly what the v1 contract can express — no more", () => {
    // A CONTRACT limit, not a taxonomy. identity.attestation.v1 carries a literal
    // `github: {id, login}` claim, so v1 can only express a GitHub subject. Widening
    // this list without a v2 contract would sign a claim the wire cannot represent.
    //
    // Attestation is NOT git-specific: claimantKey() is identity:<provider>:<id> and
    // user_bindings already admits discord/google/wallet, so a Discord contribution
    // yields identity:discord:<snowflake> and will need attesting too.
    expect([...ATTESTABLE_PROVIDERS]).toEqual(["github"]);
    expect(isAttestableProvider("github")).toBe(true);
    expect(isAttestableProvider("not-a-provider")).toBe(false);
  });

  it("derives each provider's callback from one shape", () => {
    expect(brokerCallbackPath("github")).toBe(
      "/api/auth/attest/callback/github"
    );
  });

  it("keeps the broker callback under /api/auth, grouped with sign-in", () => {
    expect(brokerCallbackPath("github").startsWith("/api/auth/")).toBe(true);
  });

  it("emits a fully-qualified redirect_uri that must be registered verbatim", () => {
    const brokerUri = brokerRedirectUri(
      { APP_BASE_URL: "https://test.cognidao.org" },
      "github"
    );
    // These are DISTINCT registrations. A shared `/api/auth/` prefix does not cover
    // both once the app holds more than one redirect URI.
    expect(brokerUri).toBe(
      "https://test.cognidao.org/api/auth/attest/callback/github"
    );
    expect(brokerUri).not.toBe("https://test.cognidao.org/api/auth/");
    expect(brokerUri).not.toBe(
      "https://test.cognidao.org/api/auth/callback/github"
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
    "app/(app)/identity/attest/confirm/actions.tsx",
    "app/api/auth/attest/callback/[provider]/route.ts",
    "app/api/auth/attest/confirm/route.ts",
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

  /**
   * Observability review: all three legs shipped with ZERO log lines, which is why
   * every LOKI cell on the first /validate-candidate run was 🟡 — there was no tier-1
   * marker to query, so the feature could never be proven at a SHA. Each leg must emit
   * a feature event, and none may log the code, token, PKCE verifier, or cookie.
   */
  it.each([
    "app/(app)/identity/attest/route.ts",
    "app/api/auth/attest/callback/[provider]/route.ts",
    "app/api/auth/attest/confirm/route.ts",
  ])("%s emits a queryable feature marker", (relative) => {
    const source = readFileSync(join(SRC_ROOT, relative), "utf8");
    expect(source).toContain("EVENT_NAMES.IDENTITY_BROKER_");
  });

  it.each([
    "app/(app)/identity/attest/route.ts",
    "app/api/auth/attest/callback/[provider]/route.ts",
    "app/api/auth/attest/confirm/route.ts",
  ])("%s never logs a broker secret", (relative) => {
    const source = readFileSync(join(SRC_ROOT, relative), "utf8");
    for (const [, logCall] of source.matchAll(
      /brokerLog\(\)\.\w+\(\s*\{([\s\S]*?)\}\s*,/g
    )) {
      expect(logCall).not.toMatch(/codeVerifier|accessToken|access_token/);
      expect(logCall).not.toMatch(/\bcode\b\s*[,:}]/);
      expect(logCall).not.toContain("BROKER_STATE_COOKIE");
    }
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

  it("routes both broker API legs through the ungated /api/auth tree", () => {
    // /api/auth is absent from the proxy matcher, exactly like NextAuth's own
    // callback — so these need no public-namespace carve-out.
    expect(proxySource).not.toContain('"/api/auth');
    expect(
      brokerRedirectUri({ APP_BASE_URL: "https://cognidao.org" }, "github")
    ).toContain("/api/auth/");
    // The form lives in the client actions component, not the server page.
    const confirmForm = readFileSync(
      join(SRC_ROOT, "app/(app)/identity/attest/confirm/actions.tsx"),
      "utf8"
    );
    expect(confirmForm).toContain('action="/api/auth/attest/confirm"');
  });

  it("still session-gates the ordinary app routes", () => {
    for (const route of ['"/chat"', '"/profile"', '"/gov"', '"/nodes"']) {
      expect(appRoutes).toContain(route);
    }
  });
});
