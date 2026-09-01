// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/operator-wallet/tests/cosmos-address`
 * Purpose: Unit tests for Cosmos bech32 address derivation — cross-checked against cosmjs DirectSecp256k1Wallet for the same key.
 * Scope: Tests deriveCosmosAddress() only. Does not perform IO or touch a chain.
 * Invariants: Derivation must byte-match DirectSecp256k1Wallet for any prefix.
 * Side-effects: none
 * Links: packages/operator-wallet/src/domain/cosmos-address.ts
 * @internal
 */

import { DirectSecp256k1Wallet } from "@cosmjs/proto-signing";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_BECH32_PREFIX,
  deriveCosmosAddress,
} from "../src/domain/cosmos-address.js";
import { SignatureFormatError } from "../src/port/cosmos-signer.port.js";
import {
  FakeCosmosSigner,
  TEST_PRIVKEY,
} from "./helpers/fake-cosmos-signer.js";

describe("deriveCosmosAddress", () => {
  it("defaults to the akash prefix", async () => {
    const signer = await FakeCosmosSigner.create();
    const address = deriveCosmosAddress(await signer.getPublicKey());
    expect(address.startsWith("akash1")).toBe(true);
    expect(DEFAULT_BECH32_PREFIX).toBe("akash");
  });

  it("matches DirectSecp256k1Wallet for the same key (akash)", async () => {
    const signer = await FakeCosmosSigner.create();
    const address = deriveCosmosAddress(await signer.getPublicKey(), "akash");

    const wallet = await DirectSecp256k1Wallet.fromKey(TEST_PRIVKEY, "akash");
    const [account] = await wallet.getAccounts();
    expect(account?.address).toBe(address);
  });

  it("matches DirectSecp256k1Wallet for a configurable prefix (cosmos)", async () => {
    const signer = await FakeCosmosSigner.create();
    const address = deriveCosmosAddress(await signer.getPublicKey(), "cosmos");
    expect(address.startsWith("cosmos1")).toBe(true);

    const wallet = await DirectSecp256k1Wallet.fromKey(TEST_PRIVKEY, "cosmos");
    const [account] = await wallet.getAccounts();
    expect(account?.address).toBe(address);
  });

  it("rejects pubkeys that are not 33 bytes", () => {
    expect(() => deriveCosmosAddress(new Uint8Array(32))).toThrow(
      SignatureFormatError
    );
    expect(() => deriveCosmosAddress(new Uint8Array(65))).toThrow(
      "expected 33-byte compressed secp256k1 pubkey"
    );
  });
});
