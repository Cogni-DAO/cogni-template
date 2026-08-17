// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/** Security tests for the authenticated identity attestation broker. */

import { beforeEach, describe, expect, it, vi } from "vitest";

const NODE_ID = "22222222-2222-4222-8222-222222222222";
const NONCE = "33333333-3333-4333-8333-333333333333";
const mockResolveNodeRef = vi.fn();
const mockIssue = vi.fn();

vi.mock("@/shared/env", () => ({
  serverEnv: () => ({
    APP_BASE_URL: "https://cognidao.org",
    DOMAIN: "cognidao.org",
    IDENTITY_ATTESTATION_PRIVATE_KEY: "seed",
  }),
}));
vi.mock("@/bootstrap/container", () => ({ resolveServiceDb: () => ({}) }));
vi.mock("@/features/nodes/node-lookup", () => ({
  resolveNodeRef: (...args: unknown[]) => mockResolveNodeRef(...args),
}));
vi.mock("@/shared/identity/attestation-keys", () => ({
  importAttestationSigningKey: () => ({}),
}));
vi.mock("@/app/_facades/identity/attestation.server", () => ({
  AttestationPreconditionError: class extends Error {},
  issueIdentityAttestation: (...args: unknown[]) => mockIssue(...args),
}));

import {
  type AttestationBrokerError,
  issueBrowserIdentityAttestation,
  validateAttestationReturnTo,
} from "@/app/_facades/identity/attestation-broker.server";

const SESSION = {
  id: "11111111-1111-4111-8111-111111111111",
  walletAddress: "0x1111111111111111111111111111111111111111",
  displayName: null,
  avatarColor: null,
};
const REQUEST = {
  nodeId: NODE_ID,
  nonce: NONCE,
  targetOrigin: "https://node-template.cognidao.org",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveNodeRef.mockResolvedValue({
    nodeId: NODE_ID,
    slug: "node-template",
    deployEnvs: ["production"],
    activityEnv: "production",
  });
  mockIssue.mockResolvedValue({ attestation: "signed.jwt", expiresIn: 600 });
});

describe("validateAttestationReturnTo", () => {
  it("accepts only the exact canonical node profile URL", () => {
    expect(
      validateAttestationReturnTo(
        "https://node-template.cognidao.org/profile",
        "https://node-template.cognidao.org"
      )
    ).toBe("https://node-template.cognidao.org/profile");
  });

  it.each([
    "https://evil.example/profile",
    "https://node-template.cognidao.org.evil.example/profile",
    "https://node-template.cognidao.org/profile?next=https://evil.example",
    "https://node-template.cognidao.org/profile#evil",
    "https://node-template.cognidao.org/other",
    "not-a-url",
  ])("rejects non-canonical return target %s", (returnTo) => {
    expect(
      validateAttestationReturnTo(
        returnTo,
        "https://node-template.cognidao.org"
      )
    ).toBeNull();
  });
});

describe("issueBrowserIdentityAttestation", () => {
  it("passes the same nodeId+nonce to issuance and returns token in fragment", async () => {
    const result = await issueBrowserIdentityAttestation({
      sessionUser: SESSION,
      request: REQUEST,
      returnTo: "https://node-template.cognidao.org/profile",
    });
    expect(mockIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        request: REQUEST,
        issuer: "https://cognidao.org",
        domain: "cognidao.org",
      })
    );
    expect(result.redirectUrl).toBe(
      "https://node-template.cognidao.org/profile#attestation=signed.jwt"
    );
  });

  it("never issues before rejecting an open redirect", async () => {
    await expect(
      issueBrowserIdentityAttestation({
        sessionUser: SESSION,
        request: REQUEST,
        returnTo: "https://evil.example/profile",
      })
    ).rejects.toMatchObject<AttestationBrokerError>({
      code: "invalid_return_to",
    });
    expect(mockIssue).not.toHaveBeenCalled();
  });

  it("accepts candidate toks4 when candidate-a is registered", async () => {
    mockResolveNodeRef.mockResolvedValue({
      nodeId: NODE_ID,
      slug: "toks4",
      deployEnvs: ["candidate-a", "production"],
      activityEnv: "production",
    });

    const result = await issueBrowserIdentityAttestation({
      sessionUser: SESSION,
      request: {
        ...REQUEST,
        targetOrigin: "https://toks4-test.cognidao.org",
      },
      returnTo: "https://toks4-test.cognidao.org/profile",
    });

    expect(result.redirectUrl).toBe(
      "https://toks4-test.cognidao.org/profile#attestation=signed.jwt"
    );
    expect(mockIssue).toHaveBeenCalledOnce();
  });

  it("rejects a canonical env origin not registered for that node", async () => {
    mockResolveNodeRef.mockResolvedValue({
      nodeId: NODE_ID,
      slug: "toks4",
      deployEnvs: ["production"],
      activityEnv: "production",
    });

    await expect(
      issueBrowserIdentityAttestation({
        sessionUser: SESSION,
        request: {
          ...REQUEST,
          targetOrigin: "https://toks4-test.cognidao.org",
        },
        returnTo: "https://toks4-test.cognidao.org/profile",
      })
    ).rejects.toMatchObject<AttestationBrokerError>({
      code: "invalid_return_to",
    });
    expect(mockIssue).not.toHaveBeenCalled();
  });

  it("rejects when return_to and the signed target origin disagree", async () => {
    await expect(
      issueBrowserIdentityAttestation({
        sessionUser: SESSION,
        request: REQUEST,
        returnTo: "https://node-template-test.cognidao.org/profile",
      })
    ).rejects.toMatchObject<AttestationBrokerError>({
      code: "invalid_return_to",
    });
    expect(mockIssue).not.toHaveBeenCalled();
  });

  it("rejects an unregistered node before issuance", async () => {
    mockResolveNodeRef.mockResolvedValue(null);
    await expect(
      issueBrowserIdentityAttestation({
        sessionUser: SESSION,
        request: REQUEST,
        returnTo: "https://node-template.cognidao.org/profile",
      })
    ).rejects.toMatchObject({ code: "unknown_node" });
    expect(mockIssue).not.toHaveBeenCalled();
  });
});
