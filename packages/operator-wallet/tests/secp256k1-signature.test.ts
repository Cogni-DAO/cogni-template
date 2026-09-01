// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@cogni/operator-wallet/tests/secp256k1-signature`
 * Purpose: Unit tests for signature shape helpers — low-s normalization vectors,
 *   DER→r||s parsing, backend signature coercion, and pubkey hex parsing.
 * Scope: Pure byte-level transforms only. No key custody, no IO.
 * Invariants: normalizeToLowS is idempotent; outputs are always 64 bytes.
 * Side-effects: none
 * Links: packages/operator-wallet/src/domain/secp256k1-signature.ts
 * @internal
 */

import { Secp256k1 } from "@cosmjs/crypto";
import { fromHex, toHex } from "@cosmjs/encoding";
import { describe, expect, it } from "vitest";

import {
  derToFixed64,
  normalizeToLowS,
  parseCompressedPubkeyHex,
  toFixed64LowS,
} from "../src/domain/secp256k1-signature.js";
import { SignatureFormatError } from "../src/port/cosmos-signer.port.js";
import { FakeCosmosSigner } from "./helpers/fake-cosmos-signer.js";

const SECP256K1_N = BigInt(
  "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141"
);
const HALF_N = SECP256K1_N / 2n;

function to32Bytes(value: bigint): Uint8Array {
  return fromHex(value.toString(16).padStart(64, "0"));
}

function sig64(r: bigint, s: bigint): Uint8Array {
  const out = new Uint8Array(64);
  out.set(to32Bytes(r), 0);
  out.set(to32Bytes(s), 32);
  return out;
}

/** Minimal DER encoder for test vectors (sequence of two integers). */
function derEncode(r: bigint, s: bigint): Uint8Array {
  const encodeInt = (value: bigint): number[] => {
    let bytes = Array.from(to32Bytes(value));
    while (bytes.length > 1 && bytes[0] === 0 && ((bytes[1] ?? 0) & 0x80) === 0)
      bytes = bytes.slice(1);
    if (((bytes[0] ?? 0) & 0x80) !== 0) bytes = [0, ...bytes]; // sign padding
    return [0x02, bytes.length, ...bytes];
  };
  const body = [...encodeInt(r), ...encodeInt(s)];
  return new Uint8Array([0x30, body.length, ...body]);
}

describe("normalizeToLowS", () => {
  it("returns low-s signatures unchanged (idempotent)", () => {
    const sig = sig64(123n, HALF_N); // s == n/2 is allowed
    expect(toHex(normalizeToLowS(sig))).toBe(toHex(sig));
    expect(toHex(normalizeToLowS(normalizeToLowS(sig)))).toBe(toHex(sig));
  });

  it("flips high-s to n - s and preserves r", () => {
    const r = 0xdeadbeefn;
    const highS = SECP256K1_N - 1n; // maximal valid s
    const normalized = normalizeToLowS(sig64(r, highS));
    expect(toHex(normalized)).toBe(toHex(sig64(r, 1n)));
  });

  it("flips s just above the half-order boundary", () => {
    const normalized = normalizeToLowS(sig64(7n, HALF_N + 1n));
    expect(toHex(normalized.slice(32))).toBe(
      toHex(to32Bytes(SECP256K1_N - (HALF_N + 1n)))
    );
    expect(toHex(normalized.slice(0, 32))).toBe(toHex(to32Bytes(7n)));
  });

  it("rejects signatures that are not 64 bytes", () => {
    expect(() => normalizeToLowS(new Uint8Array(63))).toThrow(
      SignatureFormatError
    );
    expect(() => normalizeToLowS(new Uint8Array(65))).toThrow(
      "expected 64-byte r||s signature"
    );
  });
});

describe("derToFixed64", () => {
  it("round-trips a DER-encoded r||s", () => {
    const r = 0x1234_5678_9abcn;
    const s = 0x0fed_cba9n;
    expect(toHex(derToFixed64(derEncode(r, s)))).toBe(toHex(sig64(r, s)));
  });

  it("strips DER sign-padding for high-bit integers", () => {
    // r with the top bit set forces a 0x00 pad byte in DER
    const r = BigInt(`0x80${"11".repeat(31)}`);
    const s = 42n;
    const der = derEncode(r, s);
    expect(der[3]).toBe(33); // padded integer length
    expect(toHex(derToFixed64(der))).toBe(toHex(sig64(r, s)));
  });

  it("rejects non-DER input", () => {
    expect(() => derToFixed64(new Uint8Array([0x02, 0x01, 0x01]))).toThrow(
      "not a DER sequence"
    );
  });
});

describe("toFixed64LowS", () => {
  it("passes through a 64-byte low-s signature", () => {
    const sig = sig64(5n, 6n);
    expect(toHex(toFixed64LowS(sig))).toBe(toHex(sig));
  });

  it("drops a trailing recovery byte from 65-byte signatures", () => {
    const sig = sig64(5n, 6n);
    const withRecovery = new Uint8Array(65);
    withRecovery.set(sig, 0);
    withRecovery[64] = 0x01;
    expect(toHex(toFixed64LowS(withRecovery))).toBe(toHex(sig));
  });

  it("parses DER input and normalizes to low-s", () => {
    const r = 99n;
    const highS = SECP256K1_N - 3n;
    expect(toHex(toFixed64LowS(derEncode(r, highS)))).toBe(toHex(sig64(r, 3n)));
  });

  it("rejects unknown signature shapes", () => {
    expect(() => toFixed64LowS(new Uint8Array(63))).toThrow(
      SignatureFormatError
    );
  });
});

describe("parseCompressedPubkeyHex", () => {
  it("accepts a 33-byte compressed key with or without 0x prefix", async () => {
    const signer = await FakeCosmosSigner.create();
    const pubkey = await signer.getPublicKey();
    const hex = toHex(pubkey);
    expect(toHex(parseCompressedPubkeyHex(hex))).toBe(hex);
    expect(toHex(parseCompressedPubkeyHex(`0x${hex}`))).toBe(hex);
  });

  it("compresses a 65-byte uncompressed key", async () => {
    const signer = await FakeCosmosSigner.create();
    const compressed = await signer.getPublicKey();
    const uncompressed = Secp256k1.uncompressPubkey(compressed);
    expect(toHex(parseCompressedPubkeyHex(toHex(uncompressed)))).toBe(
      toHex(compressed)
    );
  });

  it("rejects other lengths and non-hex input", () => {
    expect(() => parseCompressedPubkeyHex("1234")).toThrow(
      "unexpected public key length"
    );
    expect(() => parseCompressedPubkeyHex("zz".repeat(33))).toThrow(
      SignatureFormatError
    );
  });
});
