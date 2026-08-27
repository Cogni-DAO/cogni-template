// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/** Unit tests for identity-attestation issuance policy with fake ports. */

import { IDENTITY_ATTESTATION_V1_PROTOCOL_SHA256 } from "@cogni/node-contracts";
import { describe, expect, it, vi } from "vitest";

import {
  AttestationPreconditionError,
  createIdentityAttestationService,
} from "@/features/identity/services/issue-identity-attestation";
import type {
  IdentityAttestationRepositoryPort,
  IdentityAttestationSignerPort,
} from "@/ports";

const NODE_ID = "22222222-2222-4222-8222-222222222222";
const REQUEST = {
  protocol: IDENTITY_ATTESTATION_V1_PROTOCOL_SHA256,
  nodeId: NODE_ID,
  nonce: "node_generated_nonce_0123456789abcdef",
  targetOrigin: "https://toks4-test.cognidao.org",
};
const AUTHENTICATED_GITHUB = { id: "12345", login: "flock-leader" };

function service(overrides?: {
  repository?: IdentityAttestationRepositoryPort;
  signer?: IdentityAttestationSignerPort;
}) {
  const repository: IdentityAttestationRepositoryPort =
    overrides?.repository ?? {
      findNode: async () => ({
        nodeId: NODE_ID,
        slug: "toks4",
        deployEnvs: ["candidate-a", "production"],
      }),
    };
  const signer = overrides?.signer ?? { sign: vi.fn(async () => "signed.jwt") };
  return createIdentityAttestationService({
    repository,
    signer,
    clock: { now: () => "2026-08-17T00:00:00.000Z" },
    createJti: () => "33333333-3333-4333-8333-333333333333",
  });
}

describe("identity attestation issuance service", () => {
  it("signs the GitHub identity supplied by the caller for the exact node request", async () => {
    const sign = vi.fn(async () => "signed.jwt");
    const issued = await service({ signer: { sign } }).issue({
      github: AUTHENTICATED_GITHUB,
      issuer: "https://cognidao.org",
      domain: "cognidao.org",
      request: REQUEST,
    });

    expect(issued).toEqual({ attestation: "signed.jwt", expiresIn: 600 });
    expect(sign).toHaveBeenCalledWith(
      expect.objectContaining({
        protocol: IDENTITY_ATTESTATION_V1_PROTOCOL_SHA256,
        aud: `urn:cogni:node:${NODE_ID}`,
        targetOrigin: REQUEST.targetOrigin,
        github: AUTHENTICATED_GITHUB,
      })
    );
    expect(sign.mock.calls[0]?.[0]).not.toHaveProperty("wallet");
    expect(sign.mock.calls[0]?.[0]).not.toHaveProperty("sub");
  });

  /**
   * task.5024 regression: the service has NO way to look a subject up. Before the fix
   * the repository owned `findGithubIdentity(userId)` and the ambient operator session
   * chose the attested account — which bound the wrong GitHub account on the
   * 2026-08-19 candidate. Removing the lookup makes that class of bug unrepresentable.
   */
  it("exposes no subject lookup on the repository port", () => {
    const repository: IdentityAttestationRepositoryPort = {
      findNode: async () => null,
    };
    expect(repository).not.toHaveProperty("findGithubIdentity");
  });

  it("rejects an origin outside the registered deployment set before signing", async () => {
    const sign = vi.fn(async () => "signed.jwt");
    await expect(
      service({ signer: { sign } }).issue({
        github: AUTHENTICATED_GITHUB,
        issuer: "https://cognidao.org",
        domain: "cognidao.org",
        request: { ...REQUEST, targetOrigin: "https://attacker.example" },
      })
    ).rejects.toEqual(
      new AttestationPreconditionError("invalid_target_origin")
    );
    expect(sign).not.toHaveBeenCalled();
  });

  it("rejects an unregistered node before signing", async () => {
    const sign = vi.fn(async () => "signed.jwt");
    const repository: IdentityAttestationRepositoryPort = {
      findNode: async () => null,
    };

    await expect(
      service({ repository, signer: { sign } }).issue({
        github: AUTHENTICATED_GITHUB,
        issuer: "https://cognidao.org",
        domain: "cognidao.org",
        request: REQUEST,
      })
    ).rejects.toEqual(new AttestationPreconditionError("unknown_node"));
    expect(sign).not.toHaveBeenCalled();
  });

  it("resolves the node for the entry leg without signing anything", async () => {
    const sign = vi.fn(async () => "signed.jwt");
    const node = await service({ signer: { sign } }).resolveNode({
      domain: "cognidao.org",
      request: REQUEST,
    });

    expect(node).toEqual({ nodeId: NODE_ID, slug: "toks4" });
    expect(sign).not.toHaveBeenCalled();
  });
});
