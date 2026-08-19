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

import { IDENTITY_ATTESTATION_V1_PROTOCOL_SHA256 } from "@cogni/node-contracts";
import {
  createLocalJWKSet,
  decodeProtectedHeader,
  type JSONWebKeySet,
  jwtVerify,
} from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";

const envState = vi.hoisted(() => ({
  current: {} as {
    APP_BASE_URL?: string;
    NODE_SUBMODULE_PARENT_OWNER?: string;
    NODE_SUBMODULE_PARENT_REPO?: string;
    GH_REVIEW_APP_ID?: string;
    GH_REVIEW_APP_PRIVATE_KEY_BASE64?: string;
    IDENTITY_ATTESTATION_PRIVATE_KEY?: string;
  },
}));

const dbState = vi.hoisted(() => ({
  githubBinding: undefined as
    | { externalId: string; providerLogin: string | null }
    | undefined,
  walletAddress: null as string | null,
  nodeExists: true,
  duplicateNode: false,
  deployEnvs: ["production"] as Array<"candidate-a" | "preview" | "production">,
}));

const mockGetServerSessionUser = vi.hoisted(() => vi.fn());
const mockListCatalogNodes = vi.hoisted(() => vi.fn());
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
vi.mock("@/shared/env/server-env", () => ({
  serverEnv: () => envState.current,
}));

vi.mock("@/bootstrap/capabilities/operator-deploy-plane", () => ({
  createOperatorDeployPlane: () => ({
    listCatalogNodes: (...args: unknown[]) => mockListCatalogNodes(...args),
  }),
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

const NODE_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const NONCE = "node_generated_nonce_0123456789abcdef";

import { GET as jwksGET } from "@/app/.well-known/jwks.json/route";
import { POST } from "@/app/api/v1/identity/attestations/route";

const ISSUER = "https://operator.test";
const TARGET_ORIGIN = "https://node-template.operator.test";

function postRequest(
  body: Record<string, unknown> = {
    protocol: IDENTITY_ATTESTATION_V1_PROTOCOL_SHA256,
    nodeId: NODE_ID,
    nonce: NONCE,
    targetOrigin: TARGET_ORIGIN,
  },
  origin = "https://untrusted-host.example"
): Request {
  return new Request(`${origin}/api/v1/identity/attestations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function freshSeed(): string {
  return randomBytes(32).toString("base64");
}

describe("POST /api/v1/identity/attestations", () => {
  beforeEach(() => {
    envState.current = {
      APP_BASE_URL: ISSUER,
      NODE_SUBMODULE_PARENT_OWNER: "cogni-test-org",
      NODE_SUBMODULE_PARENT_REPO: "cogni-monorepo",
      GH_REVIEW_APP_ID: "test-app-id",
      GH_REVIEW_APP_PRIVATE_KEY_BASE64: "test-private-key",
      IDENTITY_ATTESTATION_PRIVATE_KEY: freshSeed(),
    };
    dbState.githubBinding = { externalId: "12345", providerLogin: "octocat" };
    dbState.walletAddress = "0xAbCdEf0123456789aBcDeF0123456789ABCDEF01";
    dbState.nodeExists = true;
    dbState.duplicateNode = false;
    dbState.deployEnvs = ["production"];
    mockListCatalogNodes.mockReset();
    mockListCatalogNodes.mockImplementation(async () =>
      dbState.nodeExists
        ? [
            {
              nodeId: NODE_ID,
              slug: "node-template",
              deployEnvs: dbState.deployEnvs,
            },
            ...(dbState.duplicateNode
              ? [
                  {
                    nodeId: NODE_ID,
                    slug: "duplicate-node",
                    deployEnvs: ["production" as const],
                  },
                ]
              : []),
          ]
        : []
    );
    mockGetServerSessionUser.mockReset();
    mockGetServerSessionUser.mockResolvedValue({
      id: USER_ID,
      walletAddress: null,
      displayName: null,
      avatarColor: null,
    });
  });

  it("issues a JWT that round-trips against the served JWKS", async () => {
    const response = await POST(postRequest());
    expect(response.status).toBe(201);
    expect(mockListCatalogNodes).toHaveBeenCalledWith({
      parentOwner: "cogni-test-org",
      parentRepo: "cogni-monorepo",
      sourceRef: "main",
    });
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
      {
        issuer: ISSUER,
        audience: `urn:cogni:node:${NODE_ID}`,
      }
    );
    expect(payload.type).toBe("identity.attestation.v1");
    expect(payload.protocol).toBe(IDENTITY_ATTESTATION_V1_PROTOCOL_SHA256);
    expect(payload.sub).toBe(USER_ID);
    expect(payload.aud).toBe(`urn:cogni:node:${NODE_ID}`);
    expect(payload.nodeId).toBe(NODE_ID);
    expect(payload.nonce).toBe(NONCE);
    expect(payload.targetOrigin).toBe(TARGET_ORIGIN);
    expect(payload.wallet).toBe("0xabcdef0123456789abcdef0123456789abcdef01");
    expect(payload.github).toEqual({ id: "12345", login: "octocat" });
    expect(payload.jti).toBeDefined();
    expect(payload.iat).toBeDefined();
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(600);
  });

  it("lowercases the wallet claim even when only the session carries it", async () => {
    dbState.walletAddress = null;
    mockGetServerSessionUser.mockResolvedValue({
      id: USER_ID,
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
      { issuer: ISSUER, audience: `urn:cogni:node:${NODE_ID}` }
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

  it("preserves a nullable GitHub login in the signed v1 claims", async () => {
    dbState.githubBinding = { externalId: "12345", providerLogin: null };

    const response = await POST(postRequest());
    expect(response.status).toBe(201);
    const body = await response.json();
    const { payload } = await jwtVerify(
      body.attestation,
      createLocalJWKSet((await (await jwksGET()).json()) as JSONWebKeySet),
      { issuer: ISSUER, audience: `urn:cogni:node:${NODE_ID}` }
    );
    expect(payload.github).toEqual({ id: "12345", login: null });
  });

  it("rejects caller-supplied audiences and malformed nonces", async () => {
    const withAudience = await POST(
      postRequest({
        protocol: IDENTITY_ATTESTATION_V1_PROTOCOL_SHA256,
        nodeId: NODE_ID,
        nonce: NONCE,
        targetOrigin: TARGET_ORIGIN,
        audience: "https://attacker.example",
      })
    );
    expect(withAudience.status).toBe(400);

    const weakNonce = await POST(
      postRequest({
        protocol: IDENTITY_ATTESTATION_V1_PROTOCOL_SHA256,
        nodeId: NODE_ID,
        nonce: "short",
        targetOrigin: TARGET_ORIGIN,
      })
    );
    expect(weakNonce.status).toBe(400);

    const driftedProtocol = await POST(
      postRequest({
        protocol: "0".repeat(64),
        nodeId: NODE_ID,
        nonce: NONCE,
        targetOrigin: TARGET_ORIGIN,
      })
    );
    expect(driftedProtocol.status).toBe(400);
  });

  it("rejects an origin not registered for the target node", async () => {
    const response = await POST(
      postRequest({
        protocol: IDENTITY_ATTESTATION_V1_PROTOCOL_SHA256,
        nodeId: NODE_ID,
        nonce: NONCE,
        targetOrigin: "https://attacker.example",
      })
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_target_origin" });
  });

  it("issues for the exact registered candidate origin from merged catalog intent", async () => {
    dbState.deployEnvs = ["candidate-a"];
    const candidateOrigin = "https://node-template-test.operator.test";

    const response = await POST(
      postRequest({
        protocol: IDENTITY_ATTESTATION_V1_PROTOCOL_SHA256,
        nodeId: NODE_ID,
        nonce: NONCE,
        targetOrigin: candidateOrigin,
      })
    );

    expect(response.status).toBe(201);
    const { payload } = await jwtVerify(
      (await response.json()).attestation,
      createLocalJWKSet((await (await jwksGET()).json()) as JSONWebKeySet),
      { issuer: ISSUER, audience: `urn:cogni:node:${NODE_ID}` }
    );
    expect(payload.targetOrigin).toBe(candidateOrigin);
  });

  it("returns 404 unknown_node rather than signing for an unregistered node", async () => {
    dbState.nodeExists = false;

    const response = await POST(postRequest());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "unknown_node" });
  });

  it("fails loud rather than choosing between duplicate catalog node ids", async () => {
    dbState.duplicateNode = true;

    await expect(POST(postRequest())).rejects.toThrow(
      `merged catalog contains duplicate node id '${NODE_ID}'`
    );
  });

  it("uses configured APP_BASE_URL as issuer, never request host headers", async () => {
    const request = postRequest(undefined, "https://attacker.example");
    request.headers.set("x-forwarded-host", "forwarded-attacker.example");
    request.headers.set("x-forwarded-proto", "https");

    const response = await POST(request);
    expect(response.status).toBe(201);
    const body = await response.json();
    const { payload } = await jwtVerify(
      body.attestation,
      createLocalJWKSet((await (await jwksGET()).json()) as JSONWebKeySet),
      { issuer: ISSUER, audience: `urn:cogni:node:${NODE_ID}` }
    );
    expect(payload.iss).toBe(ISSUER);
  });

  it("returns 503 attestation_unavailable when the signing key is unset", async () => {
    envState.current = { APP_BASE_URL: ISSUER };

    const response = await POST(postRequest());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "attestation_unavailable" });
  });

  it("returns 503 attestation_unavailable when the signing key is malformed", async () => {
    envState.current = {
      APP_BASE_URL: ISSUER,
      IDENTITY_ATTESTATION_PRIVATE_KEY: "not-a-seed",
    };

    const response = await POST(postRequest());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "attestation_unavailable" });
  });

  it("returns 503 when the canonical issuer config is absent", async () => {
    envState.current = { IDENTITY_ATTESTATION_PRIVATE_KEY: freshSeed() };

    const response = await POST(postRequest());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "attestation_unavailable" });
  });

  it.each([
    "http://operator.test",
    "https://user:pass@operator.test",
  ])("returns 503 for unsafe issuer config %s", async (issuer) => {
    envState.current = {
      APP_BASE_URL: issuer,
      IDENTITY_ATTESTATION_PRIVATE_KEY: freshSeed(),
    };

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
