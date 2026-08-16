// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/unit/app/api/identity-attestations-route`
 * Purpose: Unit coverage for POST /api/v1/identity/attestations and
 *   GET /.well-known/jwks.json (task.5024 fleet identity issuer).
 * Scope: Mocks auth + DB + env leaves; exercises the real routes, key
 *   derivation, and a full issue → JWKS-verify round trip via jose.
 * Side-effects: none
 * Links: src/app/api/v1/identity/attestations/route.ts, src/app/.well-known/jwks.json/route.ts
 * @public
 */

import { randomBytes } from "node:crypto";

import {
  createLocalJWKSet,
  decodeProtectedHeader,
  type JSONWebKeySet,
  jwtVerify,
} from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";

const envState = vi.hoisted(() => ({
  current: {} as { IDENTITY_ATTESTATION_PRIVATE_KEY?: string },
}));

const dbState = vi.hoisted(() => ({
  githubBinding: undefined as
    | { externalId: string; providerLogin: string | null }
    | undefined,
  walletAddress: null as string | null,
}));

const mockGetServerSessionUser = vi.hoisted(() => vi.fn());
const mockLog = vi.hoisted(() => ({
  child: vi.fn().mockReturnThis(),
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("@/shared/env", () => ({
  serverEnv: () => envState.current,
}));

vi.mock("@/lib/auth/server", () => ({
  getServerSessionUser: (...args: unknown[]) =>
    mockGetServerSessionUser(...args),
}));

vi.mock("@/bootstrap/container", () => ({
  resolveAppDb: () => ({}),
  getContainer: () => ({
    config: { unhandledErrorPolicy: "rethrow" },
    log: mockLog,
    clock: { now: () => new Date() },
  }),
}));

vi.mock("@cogni/db-client", () => ({
  withTenantScope: async (
    _db: unknown,
    _actor: unknown,
    run: (tx: unknown) => unknown
  ) => run(mockTx),
}));

const mockTx = {
  select: () => ({
    from: () => ({
      where: () => ({
        limit: () => (dbState.githubBinding ? [dbState.githubBinding] : []),
      }),
    }),
  }),
  query: {
    users: {
      findFirst: async () => ({ walletAddress: dbState.walletAddress }),
    },
  },
};

import { GET as jwksGET } from "@/app/.well-known/jwks.json/route";
import { POST } from "@/app/api/v1/identity/attestations/route";

const ISSUER = "https://operator.test";

function postRequest(): Request {
  return new Request(`${ISSUER}/api/v1/identity/attestations`, {
    method: "POST",
  });
}

function freshSeed(): string {
  return randomBytes(32).toString("base64");
}

describe("POST /api/v1/identity/attestations", () => {
  beforeEach(() => {
    envState.current = { IDENTITY_ATTESTATION_PRIVATE_KEY: freshSeed() };
    dbState.githubBinding = { externalId: "12345", providerLogin: "octocat" };
    dbState.walletAddress = "0xAbCdEf0123456789aBcDeF0123456789ABCDEF01";
    mockGetServerSessionUser.mockReset();
    mockGetServerSessionUser.mockResolvedValue({
      id: "user-1",
      walletAddress: null,
      displayName: null,
      avatarColor: null,
    });
  });

  it("issues a JWT that round-trips against the served JWKS", async () => {
    const response = await POST(postRequest());
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.expiresIn).toBe(600);

    const jwksResponse = await jwksGET();
    expect(jwksResponse.status).toBe(200);
    const jwksDoc = (await jwksResponse.json()) as JSONWebKeySet;
    expect(jwksDoc.keys).toHaveLength(1);
    expect(jwksDoc.keys[0]).toMatchObject({
      kty: "OKP",
      crv: "Ed25519",
      alg: "EdDSA",
      use: "sig",
    });
    expect(jwksDoc.keys[0]?.kid).toBeDefined();

    const header = decodeProtectedHeader(body.attestation);
    expect(header.alg).toBe("EdDSA");
    expect(header.kid).toBe(jwksDoc.keys[0]?.kid);

    const { payload } = await jwtVerify(
      body.attestation,
      createLocalJWKSet(jwksDoc),
      { issuer: ISSUER }
    );
    expect(payload.sub).toBe("user-1");
    expect(payload.wallet).toBe("0xabcdef0123456789abcdef0123456789abcdef01");
    expect(payload.github).toEqual({ id: "12345", login: "octocat" });
    expect(payload.jti).toBeDefined();
    expect(payload.iat).toBeDefined();
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(600);
  });

  it("lowercases the wallet claim even when only the session carries it", async () => {
    dbState.walletAddress = null;
    mockGetServerSessionUser.mockResolvedValue({
      id: "user-1",
      walletAddress: "0xFFEE0123456789ABCDEF0123456789ABCDEF0001",
      displayName: null,
      avatarColor: null,
    });

    const response = await POST(postRequest());
    expect(response.status).toBe(201);
    const body = await response.json();
    const { payload } = await jwtVerify(
      body.attestation,
      createLocalJWKSet((await (await jwksGET()).json()) as JSONWebKeySet),
      { issuer: ISSUER }
    );
    expect(payload.wallet).toBe("0xffee0123456789abcdef0123456789abcdef0001");
  });

  it("returns 409 no_wallet when neither session nor users row has a wallet", async () => {
    dbState.walletAddress = null;

    const response = await POST(postRequest());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "no_wallet" });
  });

  it("returns 409 no_github_binding when no github user_binding exists", async () => {
    dbState.githubBinding = undefined;

    const response = await POST(postRequest());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "no_github_binding" });
  });

  it("returns 503 attestation_unavailable when the signing key is unset", async () => {
    envState.current = {};

    const response = await POST(postRequest());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "attestation_unavailable" });
  });

  it("returns 503 attestation_unavailable when the signing key is malformed", async () => {
    envState.current = { IDENTITY_ATTESTATION_PRIVATE_KEY: "not-a-seed" };

    const response = await POST(postRequest());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "attestation_unavailable" });
  });
});

describe("GET /.well-known/jwks.json", () => {
  beforeEach(() => {
    envState.current = {};
  });

  it("serves an empty key set when the signing key is unset", async () => {
    const response = await jwksGET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ keys: [] });
  });

  it("serves an empty key set when the signing key is malformed", async () => {
    envState.current = { IDENTITY_ATTESTATION_PRIVATE_KEY: "@@garbage@@" };

    const response = await jwksGET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ keys: [] });
  });

  it("derives a stable kid for the same seed", async () => {
    envState.current = { IDENTITY_ATTESTATION_PRIVATE_KEY: freshSeed() };

    const first = (await (await jwksGET()).json()) as JSONWebKeySet;
    const second = (await (await jwksGET()).json()) as JSONWebKeySet;
    expect(first.keys[0]?.kid).toBe(second.keys[0]?.kid);
  });
});
