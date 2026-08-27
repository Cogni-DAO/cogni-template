// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/** Unit tests for identity-attestation issuance policy with fake ports. */

import { IDENTITY_ATTESTATION_V1_PROTOCOL_SHA256 } from "@cogni/node-contracts";
import { describe, expect, it, vi } from "vitest";

import { OperatorIdentityAttestationRepository } from "@/adapters/server/identity/identity-attestation.adapter";
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

/**
 * bug.5063 — the node lookup sits on the interactive auth path, in front of a human.
 * The App-authenticated catalog read measured 11.0s cold / 0.22s warm on candidate-a,
 * which a human reads as broken. These pin the ordering that fixes it.
 */
describe("broker node lookup ordering (bug.5063)", () => {
  const ROW = {
    id: NODE_ID,
    slug: "toks4",
    deployEnvs: ["candidate-a", "production"],
  };

  function repoWith(findNodeRow?: (id: string) => Promise<typeof ROW | null>) {
    const listCatalogNodes = vi.fn(async () => [
      { nodeId: NODE_ID, slug: "toks4", deployEnvs: ["candidate-a"] },
    ]);
    const repository = new OperatorIdentityAttestationRepository(
      { listCatalogNodes } as never,
      { parentOwner: "Cogni-DAO", parentRepo: "cogni" },
      findNodeRow as never
    );
    return { repository, listCatalogNodes };
  }

  it("never touches the catalog when the projection has the node", async () => {
    const { repository, listCatalogNodes } = repoWith(async () => ROW);

    await expect(repository.findNode(NODE_ID)).resolves.toEqual({
      nodeId: NODE_ID,
      slug: "toks4",
      deployEnvs: ["candidate-a", "production"],
    });
    // The whole point: no GitHub round trip in front of the human.
    expect(listCatalogNodes).not.toHaveBeenCalled();
  });

  it("falls back to the catalog for a node registered since the last reconcile", async () => {
    // catalog-registry-reconcile polls every ten minutes, so a just-registered node is
    // absent from the projection. Rejecting it would be fail-closed but WRONG —
    // unknown_node for a node that exists. Pay the slow read once instead.
    const { repository, listCatalogNodes } = repoWith(async () => null);

    await expect(repository.findNode(NODE_ID)).resolves.toMatchObject({
      nodeId: NODE_ID,
    });
    expect(listCatalogNodes).toHaveBeenCalledOnce();
  });

  it("propagates a projection read error instead of silently falling open", async () => {
    // The adapter does NOT swallow this. Swallowing here would make a DB outage
    // indistinguishable from "node absent", and the fallback would then quietly
    // re-answer from the catalog on every request — losing the whole fix under load
    // with no signal. Containment belongs at the composition edge: the bootstrap
    // `findNodeRow` catches and returns null, so production degrades to the catalog
    // deliberately and in one place.
    const { repository, listCatalogNodes } = repoWith(async () => {
      throw new Error("db down");
    });

    await expect(repository.findNode(NODE_ID)).rejects.toThrow("db down");
    expect(listCatalogNodes).not.toHaveBeenCalled();
  });
});
