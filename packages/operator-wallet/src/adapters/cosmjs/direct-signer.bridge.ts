// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/operator-wallet/adapters/cosmjs/direct-signer.bridge`
 * Purpose: Bridge a CosmosSignerPort into a cosmjs `OfflineDirectSigner` so any Stargate/Akash client can sign SIGN_MODE_DIRECT transactions through the port.
 * Scope: Digest routing only — `signDirect` hashes the SignDoc bytes (sha256) and delegates to `port.signDigest`. Does not build transactions or broadcast.
 * Invariants:
 *   - KEY_NEVER_IN_APP — only the 32-byte digest reaches the port.
 *   - LOW_S_SIGNATURES — the port contract guarantees 64-byte low-s `r||s`,
 *     which is exactly the fixed-length signature cosmjs expects.
 * Side-effects: none (delegates IO to the injected port)
 * Links: work items task.5059 (pipeline proven on live akashnet-2), task.5060
 * @public
 */

import { sha256 } from "@cosmjs/crypto";
import { toBase64 } from "@cosmjs/encoding";
import type {
  AccountData,
  DirectSignResponse,
  OfflineDirectSigner,
} from "@cosmjs/proto-signing";
import { makeSignBytes } from "@cosmjs/proto-signing";
import type { SignDoc } from "cosmjs-types/cosmos/tx/v1beta1/tx.js";

import {
  DEFAULT_BECH32_PREFIX,
  deriveCosmosAddress,
} from "../../domain/cosmos-address.js";
import {
  type CosmosSignerPort,
  SignatureFormatError,
} from "../../port/cosmos-signer.port.js";

/**
 * Create a cosmjs `OfflineDirectSigner` backed by a {@link CosmosSignerPort}.
 *
 * The signer exposes a single account whose address is derived from the port's
 * compressed pubkey (`bech32(prefix, ripemd160(sha256(pubkey)))`), and routes
 * `signDirect` through `sha256(SignDoc bytes) → port.signDigest`.
 *
 * @param port - key custody seam (Privy, OpenBao plugin, local test key, ...)
 * @param addressPrefix - bech32 prefix (default `"akash"`)
 */
export function createDirectSignerFromPort(
  port: CosmosSignerPort,
  addressPrefix: string = DEFAULT_BECH32_PREFIX
): OfflineDirectSigner {
  const getAccount = async (): Promise<AccountData> => {
    const pubkey = await port.getPublicKey();
    return {
      address: deriveCosmosAddress(pubkey, addressPrefix),
      algo: "secp256k1",
      pubkey,
    };
  };

  return {
    getAccounts: async (): Promise<readonly AccountData[]> => [
      await getAccount(),
    ],
    signDirect: async (
      signerAddress: string,
      signDoc: SignDoc
    ): Promise<DirectSignResponse> => {
      const account = await getAccount();
      if (signerAddress !== account.address) {
        throw new Error(
          `unknown signer address ${signerAddress} (expected ${account.address})`
        );
      }
      const digest = sha256(makeSignBytes(signDoc));
      const signature = await port.signDigest(digest);
      if (signature.length !== 64) {
        throw new SignatureFormatError(
          `port returned ${signature.length}-byte signature, expected 64 (r||s)`
        );
      }
      return {
        signed: signDoc,
        signature: {
          pub_key: {
            type: "tendermint/PubKeySecp256k1",
            value: toBase64(account.pubkey),
          },
          signature: toBase64(signature),
        },
      };
    },
  };
}
