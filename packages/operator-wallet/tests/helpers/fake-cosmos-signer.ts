// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@cogni/operator-wallet/tests/helpers/fake-cosmos-signer`
 * Purpose: Deterministic in-memory CosmosSignerPort for unit tests — a fixed local
 *   secp256k1 key so signatures can be cross-checked against cosmjs DirectSecp256k1Wallet.
 * Scope: Test helper only. Never used in production; key material is a public test vector.
 * Invariants: Same key every run (privkey = sha256 of a fixed label); low-s signatures.
 * Side-effects: none
 * Links: packages/operator-wallet/src/port/cosmos-signer.port.ts
 * @internal
 */

import { Secp256k1, sha256 } from "@cosmjs/crypto";
import { toUtf8 } from "@cosmjs/encoding";

import { normalizeToLowS } from "../../src/domain/secp256k1-signature.js";
import type { CosmosSignerPort } from "../../src/port/cosmos-signer.port.js";

/** Fixed, publicly-known test private key (NOT a secret — test vector only). */
export const TEST_PRIVKEY: Uint8Array = sha256(
  toUtf8("cogni operator-wallet cosmos fake signer v1")
);

/** Deterministic local-key implementation of CosmosSignerPort. */
export class FakeCosmosSigner implements CosmosSignerPort {
  private constructor(
    /** Exposed so tests can cross-check against DirectSecp256k1Wallet.fromKey. */
    public readonly privkey: Uint8Array,
    private readonly compressedPubkey: Uint8Array
  ) {}

  static async create(
    privkey: Uint8Array = TEST_PRIVKEY
  ): Promise<FakeCosmosSigner> {
    const { pubkey } = await Secp256k1.makeKeypair(privkey);
    return new FakeCosmosSigner(privkey, Secp256k1.compressPubkey(pubkey));
  }

  async getPublicKey(): Promise<Uint8Array> {
    return this.compressedPubkey;
  }

  async signDigest(digest: Uint8Array): Promise<Uint8Array> {
    const extended = await Secp256k1.createSignature(digest, this.privkey);
    const fixed = new Uint8Array(64);
    fixed.set(extended.r(32), 0);
    fixed.set(extended.s(32), 32);
    return normalizeToLowS(fixed);
  }
}
