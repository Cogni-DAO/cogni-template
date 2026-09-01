// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/operator-wallet/tests/direct-signer-bridge`
 * Purpose: Unit tests for the CosmosSignerPort → cosmjs OfflineDirectSigner bridge — digest routing, signature verification, and byte-equality with DirectSecp256k1Wallet.
 * Scope: Fake local signer only. Does not call Privy or touch a chain.
 * Invariants: Bridge signatures must verify against sha256(SignDoc bytes) and
 *   byte-match cosmjs's own wallet for the same key/doc (RFC6979 determinism).
 * Side-effects: none
 * Links: packages/operator-wallet/src/adapters/cosmjs/direct-signer.bridge.ts
 * @internal
 */

import { Secp256k1, Secp256k1Signature, sha256 } from "@cosmjs/crypto";
import { fromBase64, toBase64 } from "@cosmjs/encoding";
import {
  DirectSecp256k1Wallet,
  makeSignBytes,
  makeSignDoc,
} from "@cosmjs/proto-signing";
import { describe, expect, it } from "vitest";

import { createDirectSignerFromPort } from "../src/adapters/cosmjs/direct-signer.bridge.js";
import { deriveCosmosAddress } from "../src/domain/cosmos-address.js";
import {
  type CosmosSignerPort,
  SignatureFormatError,
} from "../src/port/cosmos-signer.port.js";
import {
  FakeCosmosSigner,
  TEST_PRIVKEY,
} from "./helpers/fake-cosmos-signer.js";

/** Deterministic SignDoc fixture — bytes are opaque to SIGN_MODE_DIRECT signing. */
function testSignDoc() {
  const bodyBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const authInfoBytes = new Uint8Array([9, 10, 11, 12]);
  return makeSignDoc(bodyBytes, authInfoBytes, "akashnet-2", 42);
}

describe("createDirectSignerFromPort", () => {
  it("exposes one secp256k1 account with the port-derived address", async () => {
    const port = await FakeCosmosSigner.create();
    const signer = createDirectSignerFromPort(port);
    const accounts = await signer.getAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.algo).toBe("secp256k1");
    expect(accounts[0]?.address).toBe(
      deriveCosmosAddress(await port.getPublicKey(), "akash")
    );
  });

  it("produces a signature that verifies against sha256(SignDoc bytes)", async () => {
    const port = await FakeCosmosSigner.create();
    const signer = createDirectSignerFromPort(port);
    const [account] = await signer.getAccounts();
    if (!account) throw new Error("no account");

    const signDoc = testSignDoc();
    const { signed, signature } = await signer.signDirect(
      account.address,
      signDoc
    );

    expect(signed).toBe(signDoc);
    expect(signature.pub_key.type).toBe("tendermint/PubKeySecp256k1");
    expect(signature.pub_key.value).toBe(toBase64(account.pubkey));

    const digest = sha256(makeSignBytes(signed));
    const sigBytes = fromBase64(signature.signature);
    expect(sigBytes).toHaveLength(64);
    const ok = await Secp256k1.verifySignature(
      Secp256k1Signature.fromFixedLength(sigBytes),
      digest,
      await port.getPublicKey()
    );
    expect(ok).toBe(true);
  });

  it("byte-matches DirectSecp256k1Wallet.signDirect for the same key and doc", async () => {
    const port = await FakeCosmosSigner.create();
    const bridged = createDirectSignerFromPort(port);
    const wallet = await DirectSecp256k1Wallet.fromKey(TEST_PRIVKEY, "akash");
    const [account] = await wallet.getAccounts();
    if (!account) throw new Error("no account");

    const signDoc = testSignDoc();
    const fromBridge = await bridged.signDirect(account.address, signDoc);
    const fromWallet = await wallet.signDirect(account.address, signDoc);

    expect(fromBridge.signature.signature).toBe(fromWallet.signature.signature);
    expect(fromBridge.signature.pub_key.value).toBe(
      fromWallet.signature.pub_key.value
    );
  });

  it("supports a configurable address prefix", async () => {
    const port = await FakeCosmosSigner.create();
    const signer = createDirectSignerFromPort(port, "cosmos");
    const [account] = await signer.getAccounts();
    expect(account?.address.startsWith("cosmos1")).toBe(true);
  });

  it("rejects sign requests for an unknown address", async () => {
    const port = await FakeCosmosSigner.create();
    const signer = createDirectSignerFromPort(port);
    await expect(
      signer.signDirect("akash1unknownaddress", testSignDoc())
    ).rejects.toThrow("unknown signer address");
  });

  it("rejects malformed signatures coming back from the port", async () => {
    const real = await FakeCosmosSigner.create();
    const badPort: CosmosSignerPort = {
      getPublicKey: () => real.getPublicKey(),
      signDigest: async () => new Uint8Array(65), // wrong shape
    };
    const signer = createDirectSignerFromPort(badPort);
    const [account] = await signer.getAccounts();
    if (!account) throw new Error("no account");
    await expect(
      signer.signDirect(account.address, testSignDoc())
    ).rejects.toThrow(SignatureFormatError);
  });
});
