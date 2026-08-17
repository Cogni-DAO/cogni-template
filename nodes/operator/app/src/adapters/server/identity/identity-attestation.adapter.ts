// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/** Drizzle persistence and Ed25519 signing adapters for identity attestations. */

import type { KeyObject } from "node:crypto";

import { withTenantScope, type Database } from "@cogni/db-client";
import { type UserId, userActor } from "@cogni/ids";
import { and, eq } from "drizzle-orm";
import { SignJWT } from "jose";

import type {
  IdentityAttestationJwtClaims,
  IdentityAttestationRepositoryPort,
  IdentityAttestationSignerPort,
} from "@/ports";
import { nodes } from "@/shared/db/nodes";
import { userBindings, users } from "@/shared/db/schema";
import {
  ATTESTATION_ALG,
  attestationKeyId,
} from "@/shared/identity/attestation-keys";

export class DrizzleIdentityAttestationRepository
  implements IdentityAttestationRepositoryPort
{
  constructor(
    private readonly appDb: Database,
    private readonly serviceDb: Database
  ) {}

  async findNode(nodeId: string) {
    const rows = await this.serviceDb
      .select({
        nodeId: nodes.id,
        slug: nodes.slug,
        deployEnvs: nodes.deployEnvs,
      })
      .from(nodes)
      .where(eq(nodes.id, nodeId))
      .limit(1);
    return rows[0] ?? null;
  }

  async findSubject(userId: string, fallbackWalletAddress: string | null) {
    const actorId = userActor(userId as UserId);
    return withTenantScope(this.appDb, actorId, async (tx) => {
      const [bindings, user] = await Promise.all([
        tx
          .select({
            externalId: userBindings.externalId,
            providerLogin: userBindings.providerLogin,
          })
          .from(userBindings)
          .where(
            and(
              eq(userBindings.userId, userId),
              eq(userBindings.provider, "github")
            )
          )
          .limit(1),
        tx.query.users.findFirst({
          where: eq(users.id, userId),
          columns: { walletAddress: true },
        }),
      ]);
      const binding = bindings[0];
      return {
        walletAddress: user?.walletAddress ?? fallbackWalletAddress,
        github: binding
          ? { id: binding.externalId, login: binding.providerLogin }
          : null,
      };
    });
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
