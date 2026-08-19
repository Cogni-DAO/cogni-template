// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/.well-known/jwks.json`
 * Purpose: Public JWKS document for operator-signed identity attestations
 *   (task.5024) — nodes verify attestation JWTs against these keys.
 * Scope: Single GET handler serving current + previous public key halves
 *   (kid = RFC 7638 thumbprint). Public endpoint — no auth, like agent.json
 *   (/.well-known is outside the proxy matcher).
 * Invariants:
 *   - NEVER_500: unset or malformed IDENTITY_ATTESTATION_PRIVATE_KEY serves
 *     `{ keys: [] }` — verifiers fail closed on an empty set.
 *   - ROTATION_OVERLAP: current is first; an independently parsed previous key
 *     stays published through verifier-cache overlap. A bad previous key cannot
 *     suppress a valid current key.
 *   - PUBLIC_HALF_ONLY: only the exported public JWK ever leaves this route.
 * Side-effects: none
 * Links: docs/spec/decentralized-user-identity.md, src/shared/identity/attestation-keys.ts
 * @public
 */

import { NextResponse } from "next/server";
import { serverEnv } from "@/shared/env";
import {
  attestationPublicJwks,
  importAttestationSigningKey,
} from "@/shared/identity/attestation-keys";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=600";

export async function GET() {
  const env = serverEnv();
  const headers = { "cache-control": CACHE_CONTROL };

  if (!env.IDENTITY_ATTESTATION_PRIVATE_KEY) {
    return NextResponse.json({ keys: [] }, { headers });
  }

  try {
    const signingKeys = [
      importAttestationSigningKey(env.IDENTITY_ATTESTATION_PRIVATE_KEY),
    ];
    if (env.IDENTITY_ATTESTATION_PREVIOUS_PRIVATE_KEY) {
      try {
        signingKeys.push(
          importAttestationSigningKey(
            env.IDENTITY_ATTESTATION_PREVIOUS_PRIVATE_KEY
          )
        );
      } catch {
        // The active key remains available while operators repair a stale
        // previous slot; signing never uses this slot.
      }
    }
    const jwks = await attestationPublicJwks(signingKeys);
    return NextResponse.json(jwks, { headers });
  } catch {
    return NextResponse.json({ keys: [] }, { headers });
  }
}
