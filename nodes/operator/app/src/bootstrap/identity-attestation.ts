// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/** Composition factory for identity-attestation persistence and signing ports. */

import { type KeyObject, randomUUID } from "node:crypto";

import {
  DrizzleIdentityAttestationRepository,
  JoseIdentityAttestationSigner,
} from "@/adapters/server/identity/identity-attestation.adapter";
import {
  getContainer,
  resolveAppDb,
  resolveServiceDb,
} from "@/bootstrap/container";

export function resolveIdentityAttestationDependencies(signingKey: KeyObject) {
  return {
    repository: new DrizzleIdentityAttestationRepository(
      resolveAppDb(),
      resolveServiceDb()
    ),
    signer: new JoseIdentityAttestationSigner(signingKey),
    clock: getContainer().clock,
    createJti: randomUUID,
  };
}
