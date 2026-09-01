// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/operator-wallet/domain/secp256k1-signature`
 * Purpose: Pure secp256k1 signature/pubkey shape helpers for Cosmos signing — low-s normalization, DER→`r||s` parsing, and signature/pubkey byte coercion.
 * Scope: Byte-level transforms only. Does not hold key material, perform IO, or contain chain logic.
 * Invariants:
 *   - LOW_S_SIGNATURES — `normalizeToLowS` is idempotent and always returns s <= n/2.
 *   - Output signatures are exactly 64 bytes (`r||s`, 32B each).
 * Side-effects: none
 * Links: work items task.5059 (spike proof), task.5060 (story.5017 Track B)
 * @public
 */

import { Secp256k1 } from "@cosmjs/crypto";
import { fromHex, toHex } from "@cosmjs/encoding";

import { SignatureFormatError } from "../port/cosmos-signer.port.js";

/** secp256k1 group order (for low-s normalization). */
const SECP256K1_N = BigInt(
  "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141"
);
const SECP256K1_HALF_N = SECP256K1_N / 2n;

function bigintFromBytes(bytes: Uint8Array): bigint {
  return BigInt(`0x${toHex(bytes) || "0"}`);
}

function bigintTo32Bytes(value: bigint): Uint8Array {
  return fromHex(value.toString(16).padStart(64, "0"));
}

/**
 * Enforce low-s (Cosmos SDK rejects malleable high-s signatures). Idempotent.
 *
 * @param sig64 - 64-byte `r||s` signature
 * @returns the same bytes when s is already low; otherwise `r || (n - s)`
 * @throws {SignatureFormatError} when the input is not 64 bytes
 */
export function normalizeToLowS(sig64: Uint8Array): Uint8Array {
  if (sig64.length !== 64) {
    throw new SignatureFormatError(
      `expected 64-byte r||s signature, got ${sig64.length}`
    );
  }
  const r = sig64.slice(0, 32);
  const s = bigintFromBytes(sig64.slice(32, 64));
  if (s <= SECP256K1_HALF_N) return sig64;
  const out = new Uint8Array(64);
  out.set(r, 0);
  out.set(bigintTo32Bytes(SECP256K1_N - s), 32);
  return out;
}

/**
 * Parse a DER-encoded ECDSA signature into 64-byte `r||s` (defensive: some
 * HSMs emit DER instead of fixed-length signatures).
 *
 * @throws {SignatureFormatError} on malformed DER input
 */
export function derToFixed64(der: Uint8Array): Uint8Array {
  if (der[0] !== 0x30) throw new SignatureFormatError("not a DER sequence");
  // Short-form sequence length must cover exactly the rest of the input.
  if (der[1] !== der.length - 2) {
    throw new SignatureFormatError("DER sequence length mismatch");
  }
  let offset = 2; // 0x30, seq-len (short form; sigs are < 128 bytes)
  const readInt = (): Uint8Array => {
    if (der[offset] !== 0x02) {
      throw new SignatureFormatError("expected DER integer");
    }
    const len = der[offset + 1];
    if (len === undefined || offset + 2 + len > der.length) {
      throw new SignatureFormatError("truncated DER integer");
    }
    let bytes = der.slice(offset + 2, offset + 2 + len);
    offset += 2 + len;
    while (bytes.length > 32 && bytes[0] === 0x00) bytes = bytes.slice(1); // strip sign padding
    if (bytes.length > 32) {
      throw new SignatureFormatError("DER integer wider than 32 bytes");
    }
    const padded = new Uint8Array(32);
    padded.set(bytes, 32 - bytes.length);
    return padded;
  };
  const r = readInt();
  const s = readInt();
  if (offset !== der.length) {
    throw new SignatureFormatError("trailing bytes after DER signature");
  }
  const out = new Uint8Array(64);
  out.set(r, 0);
  out.set(s, 32);
  return out;
}

/**
 * Coerce a backend signature (fixed 64B, 65B with recovery byte, or DER) into
 * canonical 64-byte low-s `r||s`. These are exactly the shapes the task.5059
 * spike handled for Privy `raw_sign` responses.
 *
 * @throws {SignatureFormatError} when the bytes match none of the known shapes
 */
export function toFixed64LowS(signature: Uint8Array): Uint8Array {
  let sig = signature;
  // DER dispatch requires BOTH the sequence tag and a consistent sequence
  // length, so a fixed r||s that merely starts with 0x30 is never misparsed.
  if (sig[0] === 0x30 && sig[1] === sig.length - 2) {
    sig = derToFixed64(sig);
  }
  if (sig.length === 65) sig = sig.slice(0, 64); // drop recovery byte if present
  if (sig.length !== 64) {
    throw new SignatureFormatError(`unexpected signature length ${sig.length}`);
  }
  return normalizeToLowS(sig);
}

/**
 * Parse a hex secp256k1 public key ("0x"-prefixed or not; 33B compressed or
 * 65B uncompressed) into the 33-byte compressed form.
 *
 * @throws {SignatureFormatError} on any other length or non-hex input
 */
export function parseCompressedPubkeyHex(hex: string): Uint8Array {
  let raw: Uint8Array;
  try {
    raw = fromHex(hex.replace(/^0x/, ""));
  } catch {
    throw new SignatureFormatError("public key is not valid hex");
  }
  if (raw.length === 33) return raw;
  if (raw.length === 65) return Secp256k1.compressPubkey(raw);
  throw new SignatureFormatError(
    `unexpected public key length ${raw.length} (want 33 or 65 bytes)`
  );
}
