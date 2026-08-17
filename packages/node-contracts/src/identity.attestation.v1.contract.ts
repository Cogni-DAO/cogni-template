// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@contracts/identity.attestation.v1`
 * Purpose: Shared relying-party contract for operator-signed fleet identity attestations.
 * Scope: Pure Zod wire schemas and deterministic audience construction. Does not sign or verify
 *   tokens, access environment/framework state, or persist nonces.
 * Invariants:
 *   - NODE_ID_DERIVES_AUDIENCE: callers send a registered node UUID, never an arbitrary audience.
 *   - TARGET_ORIGIN_BOUND: the exact relying deployment origin is carried in the request and signed claims.
 *   - NONCE_IS_ONE_TIME_AT_RP: the opaque nonce is minted and consumed once by the relying node.
 *   - GITHUB_LOGIN_NULLABLE: GitHub's stable provider id is authoritative; login is display metadata.
 * Side-effects: none
 * Links: task.5024, docs/spec/decentralized-user-identity.md
 * @public
 */

import { z } from "zod";

export const IDENTITY_ATTESTATION_V1 = "identity.attestation.v1" as const;
export const IDENTITY_ATTESTATION_AUDIENCE_PREFIX = "urn:cogni:node:";
/** Shared issuer/verifier lifetime contract. RP nonces outlive this window. */
export const IDENTITY_ATTESTATION_TTL_SECONDS = 10 * 60;

export const IdentityAttestationNodeIdSchema = z.string().uuid();

/** Canonical HTTPS origin of the exact relying-node deployment. */
export const IdentityAttestationTargetOriginSchema = z
  .string()
  .url()
  .refine(
    (value) => {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        url.origin === value &&
        url.pathname === "/" &&
        !url.search &&
        !url.hash &&
        !url.username &&
        !url.password
      );
    },
    { message: "targetOrigin must be a canonical HTTPS origin" }
  );

/** Opaque, URL-safe challenge minted by the node RP and consumed exactly once there. */
export const IdentityAttestationNonceSchema = z
  .string()
  .min(32)
  .max(256)
  .regex(/^[A-Za-z0-9_-]+$/);

export function identityAttestationAudience(nodeId: string): string {
  return `${IDENTITY_ATTESTATION_AUDIENCE_PREFIX}${IdentityAttestationNodeIdSchema.parse(nodeId)}`;
}

export const IdentityAttestationAudienceSchema = z
  .string()
  .regex(
    /^urn:cogni:node:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  );

export const IdentityAttestationRequestSchema = z
  .object({
    nodeId: IdentityAttestationNodeIdSchema,
    nonce: IdentityAttestationNonceSchema,
    targetOrigin: IdentityAttestationTargetOriginSchema,
  })
  .strict();

export const IdentityAttestationGithubSchema = z.object({
  id: z.string().min(1),
  login: z.string().min(1).nullable(),
});

export const IdentityAttestationClaimsSchema = z
  .object({
    type: z.literal(IDENTITY_ATTESTATION_V1),
    iss: z.string().url(),
    sub: z.string().uuid(),
    aud: IdentityAttestationAudienceSchema,
    nodeId: IdentityAttestationNodeIdSchema,
    nonce: IdentityAttestationNonceSchema,
    targetOrigin: IdentityAttestationTargetOriginSchema,
    wallet: z.string().regex(/^0x[0-9a-f]{40}$/),
    github: IdentityAttestationGithubSchema,
    iat: z.number().int().nonnegative(),
    exp: z.number().int().positive(),
    jti: z.string().uuid(),
  })
  .superRefine((claims, ctx) => {
    if (claims.aud !== identityAttestationAudience(claims.nodeId)) {
      ctx.addIssue({
        code: "custom",
        path: ["aud"],
        message: "aud must be derived from nodeId",
      });
    }
    if (claims.exp <= claims.iat) {
      ctx.addIssue({
        code: "custom",
        path: ["exp"],
        message: "exp must be later than iat",
      });
    }
  });

export const identityAttestationOperation = {
  id: IDENTITY_ATTESTATION_V1,
  input: IdentityAttestationRequestSchema,
  output: z.object({
    attestation: z.string().min(1),
    expiresIn: z.number().int().positive(),
  }),
} as const;

export type IdentityAttestationRequest = z.infer<
  typeof IdentityAttestationRequestSchema
>;
export type IdentityAttestationClaims = z.infer<
  typeof IdentityAttestationClaimsSchema
>;
