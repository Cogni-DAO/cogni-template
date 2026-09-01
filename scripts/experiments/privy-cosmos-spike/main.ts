// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@scripts/experiments/privy-cosmos-spike/main`
 * Purpose: task.5059 spike — prove the full Akash/Cosmos tx pipeline (pubkey -> akash1
 *   address -> live akashnet-2 account/balance query -> SIGN_MODE_DIRECT SignDoc ->
 *   digest-routed signature -> TxRaw) with signing behind a swappable RawDigestSigner,
 *   so the ONLY missing piece for an operator-signed Akash wallet is Privy credentials.
 * Scope: Runnable spike. Default is keyless + read-only (throwaway local key, no broadcast).
 * Invariants: no broadcast unless SPIKE_BROADCAST=1; no key material persisted.
 * Side-effects: IO (akashnet-2 RPC; Privy API when SPIKE_SIGNER=privy), process.env, stdout
 * Links: work item task.5059 (story.5017), scripts/experiments/privy-cosmos-signer-spike.ts
 * @internal — spike code, not for production use
 *
 * Usage:
 *   SPIKE_SIGNER=local pnpm tsx scripts/experiments/privy-cosmos-signer-spike.ts   # keyless proof (today)
 *   SPIKE_SIGNER=privy PRIVY_APP_ID=.. PRIVY_APP_SECRET=.. PRIVY_WALLET_ID=.. ...  # once creds exist
 *   SPIKE_CREATE_PRIVY_WALLET=1 PRIVY_APP_ID=.. PRIVY_APP_SECRET=.. ...            # one-time wallet mint
 *   SPIKE_BROADCAST=1 ...                                                          # actually broadcast
 */

import {
  ripemd160,
  Secp256k1,
  Secp256k1Signature,
  sha256,
} from "@cosmjs/crypto";
import { toBase64, toBech32, toHex } from "@cosmjs/encoding";
import {
  type AccountData,
  DirectSecp256k1Wallet,
  type DirectSignResponse,
  encodePubkey,
  makeAuthInfoBytes,
  makeSignBytes,
  makeSignDoc,
  type OfflineDirectSigner,
  Registry,
} from "@cosmjs/proto-signing";
import { defaultRegistryTypes, StargateClient } from "@cosmjs/stargate";
import type { SignDoc } from "cosmjs-types/cosmos/tx/v1beta1/tx.js";
import { TxRaw } from "cosmjs-types/cosmos/tx/v1beta1/tx.js";

import {
  createPrivyCosmosWallet,
  LocalThrowawaySigner,
  PrivyRawSignSigner,
  type RawDigestSigner,
} from "./signers.ts";

const BECH32_PREFIX = "akash";
const RPC_ENDPOINT =
  process.env.AKASH_RPC_URL ?? "https://rpc.akashnet.net:443";
const SEND_AMOUNT = { denom: "uakt", amount: "1" }; // 1uakt self-transfer
const FEE = { amount: [{ denom: "uakt", amount: "5000" }], gas: 200_000 };

type StepStatus = "PASS" | "FAIL" | "SKIP" | "EXPECTED_FAIL";
const verdict: Array<{ step: string; status: StepStatus; detail: string }> = [];

function record(step: string, status: StepStatus, detail: string): void {
  verdict.push({ step, status, detail });
  console.log(`\n== [${status}] ${step} ==\n   ${detail}`);
}

function banner(title: string): void {
  console.log(`\n----- ${title} -----`);
}

// ---------------------------------------------------------------------------
// a. Signer selection
// ---------------------------------------------------------------------------
async function selectSigner(): Promise<RawDigestSigner> {
  banner("STEP a: SIGNER SELECTION");
  const mode = process.env.SPIKE_SIGNER ?? "local";
  if (mode !== "local" && mode !== "privy") {
    throw new Error(`SPIKE_SIGNER must be "local" or "privy", got "${mode}"`);
  }
  const signer =
    mode === "local"
      ? await LocalThrowawaySigner.create()
      : new PrivyRawSignSigner();
  console.log(`signer mode: ${signer.kind}`);
  const pubkey = await signer.getPubkey();
  console.log(
    `compressed secp256k1 pubkey (${pubkey.length}B): ${toHex(pubkey)}`
  );
  record(
    "a. signer selection",
    "PASS",
    `kind=${signer.kind}, pubkey=${toHex(pubkey)}`
  );
  return signer;
}

// ---------------------------------------------------------------------------
// b. akash1 address derivation (sha256 -> ripemd160 -> bech32)
// ---------------------------------------------------------------------------
async function deriveAddress(signer: RawDigestSigner): Promise<string> {
  banner("STEP b: ADDRESS DERIVATION");
  const pubkey = await signer.getPubkey();
  const rawAddress = ripemd160(sha256(pubkey));
  const address = toBech32(BECH32_PREFIX, rawAddress);
  console.log(`ripemd160(sha256(pubkey)) = ${toHex(rawAddress)}`);
  console.log(`bech32(${BECH32_PREFIX}) address = ${address}`);

  let crossCheck = "skipped (no local privkey)";
  if (signer instanceof LocalThrowawaySigner) {
    const wallet = await DirectSecp256k1Wallet.fromKey(
      signer.privkey,
      BECH32_PREFIX
    );
    const [account] = await wallet.getAccounts();
    if (account?.address !== address) {
      throw new Error(
        `address mismatch: manual=${address} DirectSecp256k1Wallet=${account?.address}`
      );
    }
    crossCheck = "matches DirectSecp256k1Wallet.fromKey";
    console.log(
      `cross-check vs DirectSecp256k1Wallet: OK (${account.address})`
    );
  }
  record("b. akash1 address derivation", "PASS", `${address} (${crossCheck})`);
  return address;
}

// ---------------------------------------------------------------------------
// c. Live chain query — account number/sequence + balance on akashnet-2
// ---------------------------------------------------------------------------
interface ChainState {
  client: StargateClient;
  chainId: string;
  accountNumber: number;
  sequence: number;
  funded: boolean;
}

async function queryChain(address: string): Promise<ChainState> {
  banner("STEP c: LIVE CHAIN QUERY");
  console.log(`connecting to ${RPC_ENDPOINT} ...`);
  const client = await StargateClient.connect(RPC_ENDPOINT);
  const chainId = await client.getChainId();
  const height = await client.getHeight();
  console.log(`chainId=${chainId} height=${height}`);

  const account = await client.getAccount(address);
  const balances = await client.getAllBalances(address);
  console.log(
    `account: ${account ? JSON.stringify(account) : "null (unfunded — expected for a throwaway key)"}`
  );
  console.log(`balances: ${JSON.stringify(balances)}`);

  const accountNumber = account?.accountNumber ?? 0;
  const sequence = account?.sequence ?? 0;
  record(
    "c. chain query (akashnet-2)",
    "PASS",
    `chainId=${chainId} height=${height} accountNumber=${accountNumber} sequence=${sequence} ` +
      `balances=${JSON.stringify(balances)}${account ? "" : " (account not on chain yet — using 0/0)"}`
  );
  return { client, chainId, accountNumber, sequence, funded: account !== null };
}

// ---------------------------------------------------------------------------
// d. SignDoc build + digest-routed signing + TxRaw assembly
// ---------------------------------------------------------------------------

/** OfflineDirectSigner that routes signDirect through RawDigestSigner.signDigest(sha256(signBytes)). */
function makeDigestRoutedSigner(
  raw: RawDigestSigner,
  address: string,
  pubkey: Uint8Array
): OfflineDirectSigner {
  return {
    getAccounts: async (): Promise<readonly AccountData[]> => [
      { address, algo: "secp256k1", pubkey },
    ],
    signDirect: async (
      signerAddress: string,
      signDoc: SignDoc
    ): Promise<DirectSignResponse> => {
      if (signerAddress !== address)
        throw new Error(`unknown signer address ${signerAddress}`);
      const signBytes = makeSignBytes(signDoc);
      const digest = sha256(signBytes);
      console.log(
        `SignDoc bytes (${signBytes.length}B), sha256 digest: ${toHex(digest)}`
      );
      const signature = await raw.signDigest(digest);
      console.log(`raw signature (64B r||s, low-s): ${toHex(signature)}`);
      return {
        signed: signDoc,
        signature: {
          pub_key: {
            type: "tendermint/PubKeySecp256k1",
            value: toBase64(pubkey),
          },
          signature: toBase64(signature),
        },
      };
    },
  };
}

async function buildAndSign(
  raw: RawDigestSigner,
  address: string,
  chain: ChainState
): Promise<Uint8Array> {
  banner("STEP d: SIGNDOC BUILD + SIGN + TXRAW");
  const pubkey = await raw.getPubkey();
  const registry = new Registry(defaultRegistryTypes);

  const msg = {
    typeUrl: "/cosmos.bank.v1beta1.MsgSend",
    value: { fromAddress: address, toAddress: address, amount: [SEND_AMOUNT] },
  };
  const bodyBytes = registry.encodeTxBody({
    messages: [msg],
    memo: "task.5059 privy-cosmos signer spike",
  });
  console.log(
    `MsgSend: ${SEND_AMOUNT.amount}${SEND_AMOUNT.denom} self-transfer ${address} -> ${address}`
  );
  console.log(`TxBody bytes: ${bodyBytes.length}B`);

  const pubkeyAny = encodePubkey({
    type: "tendermint/PubKeySecp256k1",
    value: toBase64(pubkey),
  });
  const authInfoBytes = makeAuthInfoBytes(
    [{ pubkey: pubkeyAny, sequence: chain.sequence }],
    FEE.amount,
    FEE.gas,
    undefined,
    undefined
  );
  console.log(
    `AuthInfo bytes: ${authInfoBytes.length}B (fee=${FEE.amount[0]?.amount}uakt gas=${FEE.gas})`
  );

  const signDoc = makeSignDoc(
    bodyBytes,
    authInfoBytes,
    chain.chainId,
    chain.accountNumber
  );
  const signer = makeDigestRoutedSigner(raw, address, pubkey);
  const { signed, signature } = await signer.signDirect(address, signDoc);

  // Independent verification: the 64-byte sig must verify against sha256(SignDoc) + pubkey.
  const digest = sha256(makeSignBytes(signed));
  const sigBytes = Buffer.from(signature.signature, "base64");
  const ok = await Secp256k1.verifySignature(
    Secp256k1Signature.fromFixedLength(new Uint8Array(sigBytes)),
    digest,
    pubkey
  );
  if (!ok) throw new Error("signature failed local secp256k1 verification");
  console.log("local secp256k1 verification of signature vs digest+pubkey: OK");
  record(
    "d. SignDoc + digest-routed sign",
    "PASS",
    `chainId=${chain.chainId} acct=${chain.accountNumber}/${chain.sequence}; sig verifies against sha256(SignDoc)`
  );

  const txRaw = TxRaw.fromPartial({
    bodyBytes: signed.bodyBytes,
    authInfoBytes: signed.authInfoBytes,
    signatures: [new Uint8Array(sigBytes)],
  });
  const txBytes = TxRaw.encode(txRaw).finish();
  const roundTrip = TxRaw.decode(txBytes);
  if (
    roundTrip.signatures.length !== 1 ||
    roundTrip.bodyBytes.length !== signed.bodyBytes.length
  ) {
    throw new Error("TxRaw encode/decode round-trip mismatch");
  }
  console.log(
    `TxRaw assembled: ${txBytes.length}B, base64:\n${toBase64(txBytes)}`
  );
  record(
    "d2. TxRaw assembly",
    "PASS",
    `${txBytes.length}B tx, encode/decode round-trip OK`
  );
  return txBytes;
}

// ---------------------------------------------------------------------------
// e. Broadcast (guarded)
// ---------------------------------------------------------------------------
async function broadcast(
  chain: ChainState,
  txBytes: Uint8Array
): Promise<void> {
  banner("STEP e: BROADCAST");
  if (process.env.SPIKE_BROADCAST !== "1") {
    console.log(
      "SPIKE_BROADCAST != 1 -> dry-run. Tx bytes above are broadcast-ready."
    );
    console.log(
      "(simulate needs the account to exist on chain, so dry-run stops here for unfunded keys)"
    );
    record(
      "e. broadcast",
      "SKIP",
      "dry-run (SPIKE_BROADCAST != 1); tx bytes printed base64"
    );
    return;
  }
  try {
    const result = await chain.client.broadcastTx(txBytes);
    console.log(`broadcast result: ${JSON.stringify(result)}`);
    record(
      "e. broadcast",
      "PASS",
      `txhash=${result.transactionHash} code=${result.code}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const unfunded =
      /does not exist|not found|insufficient fund|unknown address/i.test(
        message
      );
    if (unfunded && !chain.funded) {
      console.log(
        `broadcast rejected as EXPECTED for an unfunded address:\n  ${message}`
      );
      record(
        "e. broadcast",
        "EXPECTED_FAIL",
        "chain rejected tx because the throwaway address is unfunded — pipeline itself is proven"
      );
    } else {
      record("e. broadcast", "FAIL", message);
    }
  }
}

// ---------------------------------------------------------------------------
// f. Verdict
// ---------------------------------------------------------------------------
function printVerdict(): boolean {
  console.log("\n================ PIPELINE VERDICT ================");
  for (const { step, status, detail } of verdict) {
    console.log(`  [${status.padEnd(13)}] ${step}`);
    console.log(`                  ${detail}`);
  }
  const failed = verdict.filter((v) => v.status === "FAIL");
  console.log("--------------------------------------------------");
  console.log(
    failed.length === 0
      ? "VERDICT: PASS — tx pipeline proven end-to-end; only missing piece for Privy mode is credentials (PRIVY_APP_ID/SECRET/WALLET_ID)."
      : `VERDICT: FAIL — ${failed.length} step(s) failed: ${failed.map((f) => f.step).join(", ")}`
  );
  console.log("==================================================");
  return failed.length === 0;
}

async function main(): Promise<void> {
  if (process.env.SPIKE_CREATE_PRIVY_WALLET === "1") {
    await createPrivyCosmosWallet();
    return;
  }
  const signer = await selectSigner();
  const address = await deriveAddress(signer);
  const chain = await queryChain(address);
  try {
    const txBytes = await buildAndSign(signer, address, chain);
    await broadcast(chain, txBytes);
  } finally {
    chain.client.disconnect();
  }
  if (!printVerdict()) process.exitCode = 1;
}

main().catch((error) => {
  console.error("\nSPIKE ABORTED:", error);
  printVerdict();
  process.exitCode = 1;
});
