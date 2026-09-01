// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/operator-wallet/adapters/privy/cosmos-signer`
 * Purpose: Privy raw-sign Cosmos signer adapter — ships 32-byte digests to Privy's `raw_sign` REST endpoint; the wallet key never leaves Privy.
 * Scope: Implements CosmosSignerPort over Privy's REST API. Does not use the Privy SDK, hold raw key material, load env, or manage process lifecycle.
 * Invariants:
 *   - KEY_NEVER_IN_APP — only digests leave the process; only signatures come back.
 *   - DIGEST_ONLY, LOW_S_SIGNATURES — see CosmosSignerPort.
 *   - NO_SECRET_LEAKAGE — thrown errors are built from status codes and static
 *     labels; credentials and raw response bodies never appear in errors or logs.
 * Side-effects: IO (Privy REST API calls)
 * Links: docs/spec/operator-wallet.md, work items task.5059 (live raw_sign proof), task.5060
 * @public
 */

import { toBase64, toHex, toUtf8 } from "@cosmjs/encoding";

import {
  parseCompressedPubkeyHex,
  toFixed64LowS,
} from "../../domain/secp256k1-signature.js";
import {
  type CosmosSignerPort,
  InvalidDigestError,
  SignatureFormatError,
  SignerRequestError,
} from "../../port/cosmos-signer.port.js";

const PRIVY_API_BASE = "https://api.privy.io";
const DEFAULT_TIMEOUT_MS = 10_000;

export interface PrivyCosmosSignerConfig {
  /** Privy application ID */
  appId: string;
  /** Privy application secret */
  appSecret: string;
  /** Privy wallet ID of the Cosmos (`chain_type: "cosmos"`) wallet */
  walletId: string;
  /**
   * Optional known public key (hex, "0x"-prefixed or not; 33B compressed or
   * 65B uncompressed). When provided, the adapter skips the wallet-fetch call.
   */
  publicKeyHex?: string;
  /** Injectable fetch (tests / custom transports). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Per-request timeout in milliseconds. Defaults to 10s. */
  timeoutMs?: number;
}

/**
 * CosmosSignerPort adapter over Privy's raw-sign endpoint:
 *   `POST /v1/wallets/{walletId}/raw_sign`  body: `{ params: { hash: "0x<digest>" } }`
 * All dependencies arrive via the constructor — no env reads.
 */
export class PrivyCosmosSigner implements CosmosSignerPort {
  private readonly walletId: string;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private pubkeyPromise: Promise<Uint8Array> | undefined;

  constructor(config: PrivyCosmosSignerConfig) {
    this.walletId = config.walletId;
    this.headers = {
      Authorization: `Basic ${toBase64(toUtf8(`${config.appId}:${config.appSecret}`))}`,
      "privy-app-id": config.appId,
      "Content-Type": "application/json",
    };
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (config.publicKeyHex !== undefined) {
      const pubkey = parseCompressedPubkeyHex(config.publicKeyHex);
      this.pubkeyPromise = Promise.resolve(pubkey);
    }
  }

  async getPublicKey(): Promise<Uint8Array> {
    if (!this.pubkeyPromise) {
      this.pubkeyPromise = this.fetchPublicKey().catch((error) => {
        this.pubkeyPromise = undefined; // allow retry after transient failures
        throw error;
      });
    }
    return this.pubkeyPromise;
  }

  async signDigest(digest: Uint8Array): Promise<Uint8Array> {
    if (digest.length !== 32) {
      throw new InvalidDigestError(
        `digest must be 32 bytes, got ${digest.length}`
      );
    }
    const response = (await this.request(
      "POST",
      `/v1/wallets/${this.walletId}/raw_sign`,
      "raw_sign",
      { params: { hash: `0x${toHex(digest)}` } }
    )) as { data?: { signature?: string } };
    const sigHex = response.data?.signature;
    if (typeof sigHex !== "string") {
      throw new SignatureFormatError("raw_sign response missing signature");
    }
    let sigBytes: Uint8Array;
    try {
      sigBytes = hexToBytes(sigHex);
    } catch {
      throw new SignatureFormatError("raw_sign signature is not valid hex");
    }
    return toFixed64LowS(sigBytes);
  }

  private async fetchPublicKey(): Promise<Uint8Array> {
    const wallet = (await this.request(
      "GET",
      `/v1/wallets/${this.walletId}`,
      "wallet fetch"
    )) as { public_key?: string };
    if (typeof wallet.public_key !== "string") {
      throw new SignatureFormatError(
        "Privy wallet response has no public_key field"
      );
    }
    return parseCompressedPubkeyHex(wallet.public_key);
  }

  /**
   * Perform one Privy REST call. Error containment: thrown errors carry only
   * the operation label + HTTP status / error name — never headers, bodies,
   * or credential material.
   */
  private async request(
    method: "GET" | "POST",
    path: string,
    label: string,
    body?: unknown
  ): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(`${PRIVY_API_BASE}${path}`, {
        method,
        headers: this.headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      const name =
        error instanceof Error && error.name === "AbortError"
          ? `timeout after ${this.timeoutMs}ms`
          : error instanceof Error
            ? error.name
            : "unknown error";
      throw new SignerRequestError(`Privy ${label} request failed: ${name}`);
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      throw new SignerRequestError(
        `Privy ${label} failed: HTTP ${res.status}`,
        res.status
      );
    }
    try {
      return (await res.json()) as unknown;
    } catch {
      throw new SignerRequestError(
        `Privy ${label} returned unparseable JSON (HTTP ${res.status})`,
        res.status
      );
    }
  }
}

/** Strict hex decode ("0x"-prefixed or not) without echoing the input into errors. */
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, "");
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) {
    throw new Error("invalid hex");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
