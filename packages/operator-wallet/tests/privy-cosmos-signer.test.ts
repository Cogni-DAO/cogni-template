// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@cogni/operator-wallet/tests/privy-cosmos-signer`
 * Purpose: Unit tests for the Privy raw-sign Cosmos adapter — request shape,
 *   signature coercion (fixed/DER/recovery-byte), pubkey caching, and error
 *   containment (no secret material or raw responses in thrown errors).
 * Scope: Injected fetchImpl only — no live Privy calls.
 * Invariants: NO_SECRET_LEAKAGE — assertions prove credentials never leak into errors.
 * Side-effects: none
 * Links: packages/operator-wallet/src/adapters/privy/privy-cosmos-signer.adapter.ts
 * @internal
 */

import { Secp256k1, Secp256k1Signature, sha256 } from "@cosmjs/crypto";
import { toBase64, toHex, toUtf8 } from "@cosmjs/encoding";
import { describe, expect, it } from "vitest";

import {
  PrivyCosmosSigner,
  type PrivyCosmosSignerConfig,
} from "../src/adapters/privy/privy-cosmos-signer.adapter.js";
import { derToFixed64 } from "../src/domain/secp256k1-signature.js";
import {
  InvalidDigestError,
  SignatureFormatError,
  SignerRequestError,
} from "../src/port/cosmos-signer.port.js";
import { FakeCosmosSigner } from "./helpers/fake-cosmos-signer.js";

const APP_ID = "test-app-id";
const APP_SECRET = "test-app-secret-DO-NOT-LEAK";
const WALLET_ID = "wallet-123";
const DIGEST = sha256(toUtf8("privy-cosmos-signer test digest"));

interface RecordedCall {
  url: string;
  method: string | undefined;
  headers: Record<string, string>;
  body: string | undefined;
}

/** Build an injectable fetch that replays canned JSON responses and records calls. */
function fakeFetch(
  responses: Array<{ status?: number; json?: unknown; body?: string }>
): { fetchImpl: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (url: unknown, init?: unknown) => {
    const request = (init ?? {}) as {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    };
    calls.push({
      url: String(url),
      method: request.method,
      headers: request.headers ?? {},
      body: request.body,
    });
    const next = responses.shift();
    if (!next) throw new Error("fakeFetch: no response queued");
    const status = next.status ?? 200;
    const body = next.body ?? JSON.stringify(next.json ?? {});
    return new Response(body, {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function makeConfig(
  overrides: Partial<PrivyCosmosSignerConfig>
): PrivyCosmosSignerConfig {
  return {
    appId: APP_ID,
    appSecret: APP_SECRET,
    walletId: WALLET_ID,
    ...overrides,
  };
}

describe("PrivyCosmosSigner.getPublicKey", () => {
  it("fetches the wallet public_key and caches it", async () => {
    const fake = await FakeCosmosSigner.create();
    const pubkeyHex = toHex(await fake.getPublicKey());
    const { fetchImpl, calls } = fakeFetch([
      { json: { id: WALLET_ID, public_key: pubkeyHex } },
    ]);
    const signer = new PrivyCosmosSigner(makeConfig({ fetchImpl }));

    const first = await signer.getPublicKey();
    const second = await signer.getPublicKey();
    expect(toHex(first)).toBe(pubkeyHex);
    expect(toHex(second)).toBe(pubkeyHex);
    expect(calls).toHaveLength(1); // cached after first fetch
    expect(calls[0]?.url).toBe(`https://api.privy.io/v1/wallets/${WALLET_ID}`);
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.headers["privy-app-id"]).toBe(APP_ID);
    expect(calls[0]?.headers.Authorization).toBe(
      `Basic ${toBase64(toUtf8(`${APP_ID}:${APP_SECRET}`))}`
    );
  });

  it("uses publicKeyHex when provided (no wallet fetch)", async () => {
    const fake = await FakeCosmosSigner.create();
    const pubkeyHex = toHex(await fake.getPublicKey());
    const { fetchImpl, calls } = fakeFetch([]);
    const signer = new PrivyCosmosSigner(
      makeConfig({ fetchImpl, publicKeyHex: `0x${pubkeyHex}` })
    );
    expect(toHex(await signer.getPublicKey())).toBe(pubkeyHex);
    expect(calls).toHaveLength(0);
  });

  it("fails with SignatureFormatError when the wallet has no public_key", async () => {
    const { fetchImpl } = fakeFetch([{ json: { id: WALLET_ID } }]);
    const signer = new PrivyCosmosSigner(makeConfig({ fetchImpl }));
    await expect(signer.getPublicKey()).rejects.toThrow(SignatureFormatError);
  });
});

describe("PrivyCosmosSigner.signDigest", () => {
  it("posts the 0x-hex digest to raw_sign and returns the 64-byte low-s signature", async () => {
    const fake = await FakeCosmosSigner.create();
    const signature = await fake.signDigest(DIGEST);
    const { fetchImpl, calls } = fakeFetch([
      {
        json: { data: { signature: `0x${toHex(signature)}`, encoding: "hex" } },
      },
    ]);
    const signer = new PrivyCosmosSigner(
      makeConfig({ fetchImpl, publicKeyHex: toHex(await fake.getPublicKey()) })
    );

    const result = await signer.signDigest(DIGEST);
    expect(result).toHaveLength(64);
    expect(calls[0]?.url).toBe(
      `https://api.privy.io/v1/wallets/${WALLET_ID}/raw_sign`
    );
    expect(calls[0]?.method).toBe("POST");
    expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({
      params: { hash: `0x${toHex(DIGEST)}` },
    });

    // Returned signature verifies against the digest + wallet pubkey.
    const ok = await Secp256k1.verifySignature(
      Secp256k1Signature.fromFixedLength(result),
      DIGEST,
      await fake.getPublicKey()
    );
    expect(ok).toBe(true);
  });

  it("handles DER-encoded and 65-byte (recovery byte) response signatures", async () => {
    const fake = await FakeCosmosSigner.create();
    const signature = await fake.signDigest(DIGEST);

    // DER path: wrap r||s in a DER sequence.
    const encodeInt = (bytes: Uint8Array): number[] => {
      let trimmed = Array.from(bytes);
      while (
        trimmed.length > 1 &&
        trimmed[0] === 0 &&
        ((trimmed[1] ?? 0) & 0x80) === 0
      )
        trimmed = trimmed.slice(1);
      if (((trimmed[0] ?? 0) & 0x80) !== 0) trimmed = [0, ...trimmed];
      return [0x02, trimmed.length, ...trimmed];
    };
    const body = [
      ...encodeInt(signature.slice(0, 32)),
      ...encodeInt(signature.slice(32)),
    ];
    const der = new Uint8Array([0x30, body.length, ...body]);
    expect(toHex(derToFixed64(der))).toBe(toHex(signature)); // sanity

    const withRecovery = new Uint8Array(65);
    withRecovery.set(signature, 0);
    withRecovery[64] = 0x00;

    const { fetchImpl } = fakeFetch([
      { json: { data: { signature: toHex(der) } } },
      { json: { data: { signature: `0x${toHex(withRecovery)}` } } },
    ]);
    const signer = new PrivyCosmosSigner(
      makeConfig({ fetchImpl, publicKeyHex: toHex(await fake.getPublicKey()) })
    );

    expect(toHex(await signer.signDigest(DIGEST))).toBe(toHex(signature));
    expect(toHex(await signer.signDigest(DIGEST))).toBe(toHex(signature));
  });

  it("rejects non-32-byte digests without touching the network", async () => {
    const { fetchImpl, calls } = fakeFetch([]);
    const signer = new PrivyCosmosSigner(makeConfig({ fetchImpl }));
    await expect(signer.signDigest(new Uint8Array(31))).rejects.toThrow(
      InvalidDigestError
    );
    expect(calls).toHaveLength(0);
  });

  it("fails with SignatureFormatError when the response has no signature", async () => {
    const { fetchImpl } = fakeFetch([{ json: { data: {} } }]);
    const signer = new PrivyCosmosSigner(makeConfig({ fetchImpl }));
    await expect(signer.signDigest(DIGEST)).rejects.toThrow(
      SignatureFormatError
    );
  });
});

describe("PrivyCosmosSigner error containment", () => {
  it("HTTP errors carry the status but never credentials or the raw response body", async () => {
    const leakyBody = JSON.stringify({
      error: "forbidden",
      echoed_secret: APP_SECRET,
      marker: "RAW_RESPONSE_MARKER",
    });
    const { fetchImpl } = fakeFetch([{ status: 401, body: leakyBody }]);
    const signer = new PrivyCosmosSigner(makeConfig({ fetchImpl }));

    const error = await signer.signDigest(DIGEST).then(
      () => {
        throw new Error("expected rejection");
      },
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(SignerRequestError);
    const requestError = error as SignerRequestError;
    expect(requestError.status).toBe(401);
    expect(requestError.message).toContain("HTTP 401");
    expect(requestError.message).not.toContain(APP_SECRET);
    expect(requestError.message).not.toContain(
      toBase64(toUtf8(`${APP_ID}:${APP_SECRET}`))
    );
    expect(requestError.message).not.toContain("RAW_RESPONSE_MARKER");
  });

  it("network failures are wrapped without echoing the underlying error message", async () => {
    const fetchImpl = (async () => {
      throw new Error(`connect refused with ${APP_SECRET} in the message`);
    }) as unknown as typeof fetch;
    const signer = new PrivyCosmosSigner(makeConfig({ fetchImpl }));

    const error = await signer.signDigest(DIGEST).then(
      () => {
        throw new Error("expected rejection");
      },
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(SignerRequestError);
    expect((error as Error).message).not.toContain(APP_SECRET);
  });
});
