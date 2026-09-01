// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/operator-wallet/domain/cosmos-address`
 * Purpose: Pure Cosmos bech32 address derivation from a compressed secp256k1 public key (`bech32(prefix, ripemd160(sha256(pubkey)))` — the standard Cosmos-SDK scheme).
 * Scope: Address math only. Does not hold key material, perform IO, or query chains.
 * Invariants: Derivation matches `@cosmjs/proto-signing` `DirectSecp256k1Wallet`
 *   for the same key (cross-checked in tests and on live akashnet-2 by task.5059).
 * Side-effects: none
 * Links: work items task.5059 (spike proof), task.5060 (story.5017 Track B)
 * @public
 */

import { ripemd160, sha256 } from "@cosmjs/crypto";
import { toBech32 } from "@cosmjs/encoding";

import { SignatureFormatError } from "../port/cosmos-signer.port.js";

/** Default bech32 human-readable prefix — Akash mainnet (`akash1...`). */
export const DEFAULT_BECH32_PREFIX = "akash";

/**
 * Derive the bech32 account address for a compressed secp256k1 public key.
 *
 * @param compressedPubkey - 33-byte compressed secp256k1 public key
 * @param prefix - bech32 human-readable prefix (default `"akash"`)
 * @throws {SignatureFormatError} when the pubkey is not 33 bytes
 */
export function deriveCosmosAddress(
  compressedPubkey: Uint8Array,
  prefix: string = DEFAULT_BECH32_PREFIX
): string {
  if (compressedPubkey.length !== 33) {
    throw new SignatureFormatError(
      `expected 33-byte compressed secp256k1 pubkey, got ${compressedPubkey.length}`
    );
  }
  return toBech32(prefix, ripemd160(sha256(compressedPubkey)));
}
