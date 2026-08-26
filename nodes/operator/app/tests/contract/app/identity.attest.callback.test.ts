// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@tests/contract/app/identity.attest.callback`
 * Purpose: Contract tests for GitHub's authorization response leg of the identity broker.
 * Scope: Validates state matching, the exchange→cookie handoff, and every failure
 *   redirect. Does NOT call GitHub or sign attestations.
 * Invariants: no operator session is ever consulted; a mismatched/absent `state` never
 *   reaches an exchange; the access token never appears in any response.
 * Side-effects: none (fully mocked)
 * Links: /api/auth/attest/callback route, task.5024
 * @public
 */

import { MOCK_SERVER_ENV } from "@tests/_fixtures/env/base-env";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieStore = vi.hoisted(() => ({
  store: new Map<string, string>(),
  get: vi.fn((name: string) => {
    const value = cookieStore.store.get(name);
    return value === undefined ? undefined : { name, value };
  }),
  set: vi.fn((name: string, value: string) => {
    cookieStore.store.set(name, value);
  }),
  delete: vi.fn((name: string) => {
    cookieStore.store.delete(name);
  }),
}));
const mockExchange = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));
vi.mock("@/shared/env", () => ({
  serverEnv: () => ({
    ...MOCK_SERVER_ENV,
    APP_BASE_URL: "https://cognidao.org",
    GH_IDENTITY_OAUTH_CLIENT_ID: "client-id",
    GH_IDENTITY_OAUTH_CLIENT_SECRET: "client-secret",
    isProd: false,
  }),
}));
vi.mock("@/shared/env/server-env", () => ({
  serverEnv: () => ({ ...MOCK_SERVER_ENV, isProd: false }),
}));
vi.mock("@/auth", () => ({ authSecret: "test-secret-0123456789abcdef" }));
vi.mock("@/shared/identity/github-oauth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/identity/github-oauth")>()),
  exchangeCodeForGithubIdentity: mockExchange,
}));
vi.mock("@/bootstrap/http/rateLimiter", () => ({
  publicApiLimiter: { consume: vi.fn(() => true) },
  extractClientIp: vi.fn(() => "test-ip"),
  TokenBucketRateLimiter: vi.fn(),
}));

import { GET } from "@/app/api/auth/attest/callback/route";
import {
  BROKER_STATE_COOKIE,
  decodeBrokerState,
  encodeBrokerState,
} from "@/shared/identity/broker-state";

const SECRET = "test-secret-0123456789abcdef";
const PENDING = {
  state: "correlation-state",
  codeVerifier: "pkce-verifier",
  nodeId: "22222222-2222-4222-8222-222222222222",
  nodeSlug: "node-template",
  nonce: "node_generated_nonce_0123456789abcdef",
  targetOrigin: "https://node-template-test.cognidao.org",
  returnTo: "https://node-template-test.cognidao.org/profile",
};

function request(query: string): NextRequest {
  return new NextRequest(
    `https://cognidao.org/api/auth/attest/callback${query}`
  );
}

async function seedPendingCookie(): Promise<void> {
  cookieStore.store.set(
    BROKER_STATE_COOKIE,
    await encodeBrokerState(PENDING, SECRET)
  );
}

describe("/api/auth/attest/callback contract tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieStore.store.clear();
    mockExchange.mockResolvedValue({ id: "295942454", login: "flock-leader" });
  });

  it("records the authenticated GitHub identity and sends the user to confirm", async () => {
    await seedPendingCookie();

    const res = await GET(request("?code=auth-code&state=correlation-state"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://cognidao.org/identity/attest/confirm"
    );
    expect(mockExchange).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "auth-code",
        codeVerifier: "pkce-verifier",
        redirectUri: "https://cognidao.org/api/auth/attest/callback",
      })
    );

    const updated = await decodeBrokerState(
      cookieStore.store.get(BROKER_STATE_COOKIE),
      SECRET
    );
    expect(updated?.github).toEqual({ id: "295942454", login: "flock-leader" });
    // The request binding is carried through untouched.
    expect(updated?.nodeId).toBe(PENDING.nodeId);
    expect(updated?.nonce).toBe(PENDING.nonce);
    expect(updated?.returnTo).toBe(PENDING.returnTo);
  });

  it("never exchanges a code whose state does not match the pending request", async () => {
    await seedPendingCookie();

    const res = await GET(request("?code=auth-code&state=attacker-state"));

    expect(mockExchange).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toContain(
      "/identity/attest/error?code=invalid_request"
    );
    expect(cookieStore.delete).toHaveBeenCalledWith(BROKER_STATE_COOKIE);
  });

  it("rejects a callback with no pending broker request at all", async () => {
    const res = await GET(request("?code=auth-code&state=correlation-state"));

    expect(mockExchange).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toContain(
      "/identity/attest/error?code=broker_request_expired"
    );
  });

  it("reports a declined authorization without touching the exchange", async () => {
    await seedPendingCookie();

    const res = await GET(request("?error=access_denied"));

    expect(mockExchange).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toContain(
      "/identity/attest/error?code=github_declined"
    );
    expect(cookieStore.delete).toHaveBeenCalledWith(BROKER_STATE_COOKIE);
  });

  it("fails closed and clears state when the exchange fails", async () => {
    await seedPendingCookie();
    mockExchange.mockRejectedValueOnce(new Error("boom"));

    const res = await GET(request("?code=auth-code&state=correlation-state"));

    expect(res.headers.get("location")).toContain(
      "/identity/attest/error?code=github_exchange_failed"
    );
    expect(cookieStore.delete).toHaveBeenCalledWith(BROKER_STATE_COOKIE);
  });

  it("returns no body, so an access token can never leak through this route", async () => {
    await seedPendingCookie();

    const res = await GET(request("?code=auth-code&state=correlation-state"));

    expect(await res.text()).toBe("");
  });
});
