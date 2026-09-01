// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@scripts/experiments/privy-cosmos-spike/signers`
 * Purpose: Raw-digest signer abstraction for the task.5059 Privy/Cosmos spike — a local
 *   in-memory secp256k1 signer (proves the pipeline today, keyless) and a Privy
 *   `raw_sign` adapter (the ONLY piece blocked on Privy credentials).
 * Scope: Spike-only. Both signers emit 64-byte low-s `r||s` signatures over a 32-byte
 *   sha256 digest, which is exactly what Cosmos SIGN_MODE_DIRECT needs.
 * Invariants: KEY_NEVER_IN_APP — local key is throwaway + in-memory only; Privy key never leaves Privy.
 * Side-effects: IO (Privy REST API for the privy signer), process.env
 * Links: work item task.5059 (story.5017), scripts/experiments/privy-cosmos-signer-spike.ts
 * @internal — spike code, not for production use
 */

import { Random, Secp256k1 } from "@cosmjs/crypto";
import { fromHex, toHex } from "@cosmjs/encoding";

/** Common seam: everything downstream of key custody is identical for local + Privy. */
export interface RawDigestSigner {
  readonly kind: "local" | "privy";
  /** 33-byte compressed secp256k1 public key. */
  getPubkey(): Promise<Uint8Array>;
  /** Sign a 32-byte digest; returns 64-byte r||s with low-s normalization. */
  signDigest(digest: Uint8Array): Promise<Uint8Array>;
}

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

/** Enforce low-s (Cosmos SDK rejects malleable high-s signatures). Idempotent. */
export function normalizeToLowS(sig64: Uint8Array): Uint8Array {
  if (sig64.length !== 64)
    throw new Error(`expected 64-byte r||s signature, got ${sig64.length}`);
  const r = sig64.slice(0, 32);
  const s = bigintFromBytes(sig64.slice(32, 64));
  if (s <= SECP256K1_HALF_N) return sig64;
  const out = new Uint8Array(64);
  out.set(r, 0);
  out.set(bigintTo32Bytes(SECP256K1_N - s), 32);
  return out;
}

/** Parse a DER-encoded ECDSA signature into 64-byte r||s (defensive: some HSMs emit DER). */
export function derToFixed64(der: Uint8Array): Uint8Array {
  if (der[0] !== 0x30) throw new Error("not a DER sequence");
  let offset = 2; // 0x30, seq-len (assume short form; sigs are < 128 bytes)
  const readInt = (): Uint8Array => {
    if (der[offset] !== 0x02) throw new Error("expected DER integer");
    const len = der[offset + 1];
    if (len === undefined) throw new Error("truncated DER integer");
    let bytes = der.slice(offset + 2, offset + 2 + len);
    offset += 2 + len;
    while (bytes.length > 32 && bytes[0] === 0x00) bytes = bytes.slice(1); // strip sign padding
    if (bytes.length > 32) throw new Error("DER integer wider than 32 bytes");
    const padded = new Uint8Array(32);
    padded.set(bytes, 32 - bytes.length);
    return padded;
  };
  const r = readInt();
  const s = readInt();
  const out = new Uint8Array(64);
  out.set(r, 0);
  out.set(s, 32);
  return out;
}

// ---------------------------------------------------------------------------
// Local signer — throwaway in-memory key. Proves the whole pipeline keylessly.
// ---------------------------------------------------------------------------

export class LocalThrowawaySigner implements RawDigestSigner {
  readonly kind = "local" as const;

  private constructor(
    /** Exposed so the spike can cross-check address derivation via DirectSecp256k1Wallet. */
    public readonly privkey: Uint8Array,
    private readonly compressedPubkey: Uint8Array
  ) {}

  static async create(): Promise<LocalThrowawaySigner> {
    const privkey = Random.getBytes(32);
    const { pubkey } = await Secp256k1.makeKeypair(privkey);
    return new LocalThrowawaySigner(privkey, Secp256k1.compressPubkey(pubkey));
  }

  async getPubkey(): Promise<Uint8Array> {
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

// ---------------------------------------------------------------------------
// Privy signer — the ONLY missing piece is credentials (PRIVY_APP_ID/SECRET/WALLET_ID).
// ---------------------------------------------------------------------------

const PRIVY_API = "https://api.privy.io";

interface PrivyEnv {
  appId: string;
  appSecret: string;
  walletId: string;
}

function readPrivyEnv(): PrivyEnv {
  const appId = process.env.PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  const walletId = process.env.PRIVY_WALLET_ID;
  if (!appId || !appSecret || !walletId) {
    throw new Error(
      "SPIKE_SIGNER=privy needs PRIVY_APP_ID, PRIVY_APP_SECRET, PRIVY_WALLET_ID " +
        "(create a wallet first: SPIKE_CREATE_PRIVY_WALLET=1 with app id+secret set)"
    );
  }
  return { appId, appSecret, walletId };
}

function privyHeaders(
  appId: string,
  appSecret: string
): Record<string, string> {
  return {
    Authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString("base64")}`,
    "privy-app-id": appId,
    "Content-Type": "application/json",
  };
}

async function privyFetch(
  path: string,
  appId: string,
  appSecret: string,
  init?: { method?: string; body?: unknown }
): Promise<unknown> {
  const res = await fetch(`${PRIVY_API}${path}`, {
    method: init?.method ?? "GET",
    headers: privyHeaders(appId, appSecret),
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Privy ${init?.method ?? "GET"} ${path} -> HTTP ${res.status}: ${text}`
    );
  }
  return JSON.parse(text) as unknown;
}

/**
 * One-time helper: create a Cosmos wallet in Privy. Logs the full response and
 * returns `{ id, publicKey }` — export the id as PRIVY_WALLET_ID for the signer.
 */
export async function createPrivyCosmosWallet(): Promise<{
  id: string;
  publicKey?: string;
}> {
  const appId = process.env.PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error("wallet creation needs PRIVY_APP_ID + PRIVY_APP_SECRET");
  }
  const body = { chain_type: "cosmos" };
  console.log(`[privy] POST /v1/wallets ${JSON.stringify(body)}`);
  const response = (await privyFetch("/v1/wallets", appId, appSecret, {
    method: "POST",
    body,
  })) as Record<string, unknown>;
  console.log(`[privy] wallet created: ${JSON.stringify(response, null, 2)}`);
  const id = String(response.id);
  const publicKey =
    typeof response.public_key === "string" ? response.public_key : undefined;
  console.log(
    `[privy] -> id=${id} public_key=${publicKey ?? "<absent — fetch wallet to read it>"}`
  );
  return { id, publicKey };
}

/** Accepts hex ("0x"-prefixed or not) compressed (33B) or uncompressed (65B) secp256k1 keys. */
function parsePubkeyHex(hex: string): Uint8Array {
  const raw = fromHex(hex.replace(/^0x/, ""));
  if (raw.length === 33) return raw;
  if (raw.length === 65) return Secp256k1.compressPubkey(raw);
  throw new Error(
    `unexpected public key length ${raw.length} (want 33 or 65 bytes)`
  );
}

/**
 * Adapter over Privy's raw-sign endpoint:
 *   POST /v1/wallets/{wallet_id}/raw_sign  body: { params: { hash: "0x<digest>" } }
 * The wallet's key never leaves Privy; we only ship a 32-byte digest and get back a signature.
 * Everything else in the pipeline (SignDoc, TxRaw, broadcast) is identical to the local path.
 */
export class PrivyRawSignSigner implements RawDigestSigner {
  readonly kind = "privy" as const;

  constructor(private readonly env: PrivyEnv = readPrivyEnv()) {}

  async getPubkey(): Promise<Uint8Array> {
    const override = process.env.PRIVY_WALLET_PUBLIC_KEY;
    if (override) return parsePubkeyHex(override);
    const wallet = (await privyFetch(
      `/v1/wallets/${this.env.walletId}`,
      this.env.appId,
      this.env.appSecret
    )) as Record<string, unknown>;
    if (typeof wallet.public_key !== "string") {
      throw new Error(
        `Privy wallet ${this.env.walletId} response has no public_key: ${JSON.stringify(wallet)}`
      );
    }
    return parsePubkeyHex(wallet.public_key);
  }

  async signDigest(digest: Uint8Array): Promise<Uint8Array> {
    if (digest.length !== 32)
      throw new Error(`digest must be 32 bytes, got ${digest.length}`);
    const response = (await privyFetch(
      `/v1/wallets/${this.env.walletId}/raw_sign`,
      this.env.appId,
      this.env.appSecret,
      { method: "POST", body: { params: { hash: `0x${toHex(digest)}` } } }
    )) as { data?: { signature?: string; encoding?: string } };
    const sigHex = response.data?.signature;
    if (!sigHex)
      throw new Error(
        `raw_sign response missing signature: ${JSON.stringify(response)}`
      );
    let sig = fromHex(sigHex.replace(/^0x/, ""));
    if (sig[0] === 0x30 && sig.length !== 64 && sig.length !== 65)
      sig = derToFixed64(sig);
    if (sig.length === 65) sig = sig.slice(0, 64); // drop recovery byte if present
    if (sig.length !== 64)
      throw new Error(`unexpected signature length ${sig.length}`);
    return normalizeToLowS(sig);
  }
}
