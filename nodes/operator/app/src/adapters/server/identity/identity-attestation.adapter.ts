// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/** Live catalog and Ed25519 signing adapters for identity attestations. */

import type { KeyObject } from "node:crypto";

import { SignJWT } from "jose";

import type {
  DeployPlanePort,
  IdentityAttestationJwtClaims,
  IdentityAttestationRepositoryPort,
  IdentityAttestationSignerPort,
} from "@/ports";
import {
  ATTESTATION_ALG,
  attestationKeyId,
} from "@/shared/identity/attestation-keys";

export interface OperatorIdentityAttestationRepositoryConfig {
  readonly parentOwner: string;
  readonly parentRepo: string;
}

/**
 * Short-TTL cache for the merged-catalog read.
 *
 * The read is an App-authenticated GitHub fetch of `main`, and it sits on the entry
 * leg BEFORE the human reaches GitHub — so its latency is user-visible. Measured at
 * ~10.7s per request on candidate-a, which reads as broken.
 *
 * Caching keeps the "read `main` directly rather than the eventually-consistent
 * registry projection" property that motivated the App-read: the window is bounded by
 * TTL, not by projection lag, and a newly registered node becomes attestable within
 * one TTL — far inside any human's register-then-use loop. The corresponding risk is
 * that a node REMOVED from the catalog stays attestable for up to one TTL; catalog
 * removal is not a security revocation path today, and the attestation is still bound
 * to that node's registered origin.
 */
const CATALOG_TTL_MS = 60_000;
type CatalogNodes = Awaited<ReturnType<DeployPlanePort["listCatalogNodes"]>>;

const catalogCache = new Map<
  string,
  { readonly at: number; readonly nodes: CatalogNodes }
>();

/**
 * Resolve relying nodes from the environment-local parent's merged catalog.
 * Identity issuance is rare and security-sensitive, so each request reads `main`
 * directly instead of trusting the eventually-consistent catalog registry
 * projection. This adapter touches no user data — the attested subject comes from
 * the GitHub authorization response, not from the operator's database (task.5024).
 */
export class OperatorIdentityAttestationRepository
  implements IdentityAttestationRepositoryPort
{
  constructor(
    private readonly deployPlane: Pick<DeployPlanePort, "listCatalogNodes">,
    private readonly config: OperatorIdentityAttestationRepositoryConfig
  ) {}

  private async catalogNodes(): Promise<CatalogNodes> {
    const key = `${this.config.parentOwner}/${this.config.parentRepo}@main`;
    const hit = catalogCache.get(key);
    if (hit && Date.now() - hit.at < CATALOG_TTL_MS) return hit.nodes;

    const nodes = await this.deployPlane.listCatalogNodes({
      parentOwner: this.config.parentOwner,
      parentRepo: this.config.parentRepo,
      sourceRef: "main",
    });
    catalogCache.set(key, { at: Date.now(), nodes });
    return nodes;
  }

  async findNode(nodeId: string) {
    const nodes = await this.catalogNodes();
    const matches = nodes.filter((candidate) => candidate.nodeId === nodeId);
    if (matches.length === 0) return null;
    if (matches.length > 1) {
      throw new Error(`merged catalog contains duplicate node id '${nodeId}'`);
    }
    const node = matches[0];
    if (!node) return null;
    return {
      nodeId: node.nodeId,
      slug: node.slug,
      deployEnvs: node.deployEnvs,
    };
  }
}

export class JoseIdentityAttestationSigner
  implements IdentityAttestationSignerPort
{
  constructor(private readonly signingKey: KeyObject) {}

  async sign(claims: IdentityAttestationJwtClaims): Promise<string> {
    const kid = await attestationKeyId(this.signingKey);
    return new SignJWT({ ...claims })
      .setProtectedHeader({ alg: ATTESTATION_ALG, typ: "JWT", kid })
      .sign(this.signingKey);
  }
}
